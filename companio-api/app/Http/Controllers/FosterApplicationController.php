<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\AnimalEvent;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\UserNotification;
use App\Services\MatchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FosterApplicationController extends Controller
{
    public function __construct(private MatchService $matcher)
    {
    }

    // ---------------------------------------------------------------
    // VOLUNTEER
    // ---------------------------------------------------------------

    // CREATE - volunteer submits a foster request
    public function store(Request $request)
    {
        $validated = $request->validate([
            'animal_id' => 'required|exists:animals,id',
            'full_name' => 'required|string|max:100',
            'phone' => 'required|string|max:30',
            'address' => 'required|string|max:255',
            'target_date' => 'required|date|after_or_equal:today',
            'message' => 'nullable|string|max:500',
            'agreed' => 'accepted',
        ]);

        $user = $request->user();
        $profile = $user->volunteerProfile;

        if (! $profile) {
            return response()->json([
                'message' => 'Please answer the home questionnaire first.',
                'needs_profile' => true,
            ], 422);
        }

        $animal = Animal::findOrFail($validated['animal_id']);

        if (! in_array($animal->status, Animal::OPEN_STATUSES, true)) {
            return response()->json([
                'message' => "{$animal->name} is no longer available for fostering.",
            ], 422);
        }

        $alreadyApplied = FosterApplication::where('user_id', $user->id)
            ->where('animal_id', $animal->id)
            ->where('status', 'Pending')
            ->exists();

        if ($alreadyApplied) {
            return response()->json([
                'message' => "You already have a pending request for {$animal->name}.",
            ], 422);
        }

        // The score is always calculated on the server, never trusted from the browser.
        $result = $this->matcher->evaluate($animal, $profile);

        $application = FosterApplication::create([
            'user_id' => $user->id,
            'animal_id' => $animal->id,
            'full_name' => $validated['full_name'],
            'phone' => $validated['phone'],
            'address' => $validated['address'],
            'target_date' => $validated['target_date'],
            'message' => $validated['message'] ?? null,
            'match_score' => $result['score'],
            'status' => 'Pending',
        ]);

        if ($animal->status === 'Awaiting Foster') {
            $animal->update(['status' => 'Under Review']);
        }

        AnimalEvent::log($animal->id, "{$application->full_name} sent a foster request ({$result['score']}% match)", $user->id);

        return response()->json([
            'message' => 'Foster request sent successfully.',
            'application' => $application->load('animal'),
        ], 201);
    }

    // READ - the logged-in volunteer's own requests (with the placement, for the timeline)
    public function mine(Request $request)
    {
        $applications = FosterApplication::with(['animal', 'placement'])
            ->where('user_id', $request->user()->id)
            ->latest('id')
            ->get();

        return response()->json($applications);
    }

    // UPDATE - volunteer cancels their own pending request
    public function withdraw(Request $request, FosterApplication $application)
    {
        if ($application->user_id !== $request->user()->id) {
            return response()->json(['message' => 'This is not your application.'], 403);
        }

        if ($application->status !== 'Pending') {
            return response()->json(['message' => 'Only pending requests can be withdrawn.'], 422);
        }

        DB::transaction(function () use ($application) {
            $application->update(['status' => 'Withdrawn']);
            $this->reopenAnimalIfNobodyWaiting($application->animal);

            AnimalEvent::log($application->animal_id, "{$application->full_name} withdrew their request", $application->user_id);
        });

        return response()->json(['message' => 'Your request was withdrawn.']);
    }

    // ---------------------------------------------------------------
    // ADMIN
    // ---------------------------------------------------------------

    // READ - review board list, with the live compatibility breakdown
    // Optional query: status, search (applicant name, email or pet name)
    public function index(Request $request)
    {
        $applications = FosterApplication::with(['user.volunteerProfile', 'animal', 'decider:id,name'])
            ->when($request->status, fn ($q, $value) => $q->where('status', $value))
            ->when($request->search, function ($q, $value) {
                $q->where(function ($q) use ($value) {
                    $q->where('full_name', 'like', "%{$value}%")
                        ->orWhereHas('user', fn ($u) => $u->where('email', 'like', "%{$value}%"))
                        ->orWhereHas('animal', fn ($a) => $a->where('name', 'like', "%{$value}%"));
                });
            })
            ->latest('id')
            ->get()
            ->map(function ($application) {
                $data = $application->toArray();
                $profile = $application->user?->volunteerProfile;

                $data['match'] = ($profile && $application->animal)
                    ? $this->matcher->evaluate($application->animal, $profile)
                    : null;

                return $data;
            });

        return response()->json($applications->values());
    }

    // UPDATE - approve or reject
    public function decide(Request $request, FosterApplication $application)
    {
        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'staff_notes' => 'nullable|string|max:500',
        ]);

        if ($application->status !== 'Pending') {
            return response()->json(['message' => 'This application was already decided.'], 422);
        }

        $animal = $application->animal;
        $admin = $request->user();

        if ($validated['status'] === 'Approved' && ! in_array($animal->status, Animal::OPEN_STATUSES, true)) {
            return response()->json([
                'message' => "{$animal->name} is not open for a new placement.",
            ], 422);
        }

        DB::transaction(function () use ($application, $animal, $validated, $admin) {
            $application->update([
                ...$validated,
                'decided_by' => $admin->id,
                'decided_at' => now(),
            ]);

            if ($validated['status'] === 'Approved') {
                // start the placement
                Placement::create([
                    'foster_application_id' => $application->id,
                    'animal_id' => $animal->id,
                    'foster_start_date' => $application->target_date,
                    'expected_return_date' => $application->target_date->copy()->addDays(30),
                    'status' => 'Active',
                ]);

                $animal->update(['status' => 'In Foster Care']);

                AnimalEvent::log($animal->id, "{$admin->name} approved {$application->full_name} as foster", $admin->id);
                UserNotification::send(
                    $application->user_id,
                    "Great news! Your request to foster {$animal->name} was approved.",
                    '/applications'
                );

                // everybody else who asked for this animal is closed automatically
                $others = FosterApplication::where('animal_id', $animal->id)
                    ->where('status', 'Pending')
                    ->where('id', '!=', $application->id)
                    ->get();

                foreach ($others as $other) {
                    $other->update([
                        'status' => 'Rejected',
                        'staff_notes' => 'Another applicant was approved for this animal.',
                        'decided_by' => $admin->id,
                        'decided_at' => now(),
                    ]);

                    UserNotification::send(
                        $other->user_id,
                        "{$animal->name} was placed with another foster. Thank you for applying!",
                        '/applications'
                    );
                }
            } else {
                AnimalEvent::log($animal->id, "{$admin->name} rejected {$application->full_name}'s request", $admin->id);
                UserNotification::send(
                    $application->user_id,
                    "Your request to foster {$animal->name} was not approved this time.",
                    '/applications'
                );

                // rejected: if nobody else is waiting, the animal is available again
                $this->reopenAnimalIfNobodyWaiting($animal);
            }
        });

        return response()->json([
            'message' => "Application {$validated['status']}.",
            'application' => $application->fresh()->load(['user', 'animal']),
        ]);
    }

    // UPDATE - undo a rejection: the application goes back to Pending
    public function reopen(Request $request, FosterApplication $application)
    {
        if ($application->status !== 'Rejected') {
            return response()->json(['message' => 'Only rejected applications can be reopened.'], 422);
        }

        $animal = $application->animal;

        if (! in_array($animal->status, Animal::OPEN_STATUSES, true)) {
            return response()->json([
                'message' => "{$animal->name} is already placed, so this request can't be reopened.",
            ], 422);
        }

        $admin = $request->user();

        DB::transaction(function () use ($application, $animal, $admin) {
            $application->update([
                'status' => 'Pending',
                'decided_by' => null,
                'decided_at' => null,
            ]);

            if ($animal->status === 'Awaiting Foster') {
                $animal->update(['status' => 'Under Review']);
            }

            AnimalEvent::log($animal->id, "{$admin->name} reopened {$application->full_name}'s request", $admin->id);
            UserNotification::send(
                $application->user_id,
                "Your request to foster {$animal->name} is being reviewed again.",
                '/applications'
            );
        });

        return response()->json([
            'message' => 'Application reopened. It is back in the Pending list.',
            'application' => $application->fresh()->load(['user', 'animal']),
        ]);
    }

    // an animal "Under Review" with no pending requests left goes back to "Awaiting Foster"
    private function reopenAnimalIfNobodyWaiting(Animal $animal): void
    {
        $othersWaiting = FosterApplication::where('animal_id', $animal->id)
            ->where('status', 'Pending')
            ->exists();

        if (! $othersWaiting && $animal->status === 'Under Review') {
            $animal->update(['status' => 'Awaiting Foster']);
        }
    }
}

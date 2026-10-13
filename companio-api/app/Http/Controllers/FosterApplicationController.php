<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;
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

        return response()->json([
            'message' => 'Foster request sent successfully.',
            'application' => $application->load('animal'),
        ], 201);
    }

    // READ - the logged-in volunteer's own requests
    public function mine(Request $request)
    {
        $applications = FosterApplication::with('animal')
            ->where('user_id', $request->user()->id)
            ->latest('id')
            ->get();

        return response()->json($applications);
    }

    // ---------------------------------------------------------------
    // ADMIN
    // ---------------------------------------------------------------

    // READ - review board list, with the live compatibility breakdown
    public function index(Request $request)
    {
        $applications = FosterApplication::with(['user.volunteerProfile', 'animal'])
            ->when($request->status, fn ($q, $value) => $q->where('status', $value))
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

        if ($validated['status'] === 'Approved' && ! in_array($animal->status, Animal::OPEN_STATUSES, true)) {
            return response()->json([
                'message' => "{$animal->name} is not open for a new placement.",
            ], 422);
        }

        DB::transaction(function () use ($application, $animal, $validated) {
            $application->update($validated);

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

                // everybody else who asked for this animal is closed automatically
                FosterApplication::where('animal_id', $animal->id)
                    ->where('status', 'Pending')
                    ->where('id', '!=', $application->id)
                    ->update([
                        'status' => 'Rejected',
                        'staff_notes' => 'Another applicant was approved for this animal.',
                    ]);
            } else {
                // rejected: if nobody else is waiting, the animal is available again
                $othersWaiting = FosterApplication::where('animal_id', $animal->id)
                    ->where('status', 'Pending')
                    ->exists();

                if (! $othersWaiting && $animal->status === 'Under Review') {
                    $animal->update(['status' => 'Awaiting Foster']);
                }
            }
        });

        return response()->json([
            'message' => "Application {$validated['status']}.",
            'application' => $application->fresh()->load(['user', 'animal']),
        ]);
    }
}

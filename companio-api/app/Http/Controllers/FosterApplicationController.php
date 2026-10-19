<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\AnimalEvent;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\UserNotification;
use App\Rules\PhilippineMobile;
use App\Services\FosterLimit;
use App\Services\MatchService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FosterApplicationController extends Controller
{
    public function __construct(private MatchService $matcher, private FosterLimit $limits) {}

    // ---------------------------------------------------------------
    // VOLUNTEER
    // ---------------------------------------------------------------

    // CREATE - volunteer submits a foster request
    public function store(Request $request)
    {
        $stored = [];
        try {
            return DB::transaction(function () use ($request, &$stored) {
                $request->user()->newQuery()->lockForUpdate()->findOrFail($request->user()->id);
                $request->user()->unsetRelation('volunteerProfile');
                Animal::whereKey($request->integer('animal_id'))->lockForUpdate()->first();

                return $this->submit($request, $stored);
            });
        } catch (\Throwable $error) {
            Storage::disk('local')->delete($stored);
            throw $error;
        }
    }

    private function submit(Request $request, array &$stored)
    {
        $profile = $request->user()->volunteerProfile;
        if (! $profile || $profile->review_status !== 'Approved') {
            return response()->json(['message' => 'Complete your profile and wait for shelter screening before applying.'], 422);
        }
        // Validate co-signer differences against the saved identity, never editable request fields.
        $request->merge(['full_name' => $request->user()->name, 'phone' => $profile->phone, 'address' => $profile->address]);
        $request->merge(['phone' => PhilippineMobile::normalize($profile->phone), 'cosigner_phone' => PhilippineMobile::normalize($request->input('cosigner_phone'))]);
        $minor = $profile->birth_date && $profile->birth_date->age < 18;
        $validated = $request->validate([
            'government_id' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:4096',
            'home_photos' => 'required|array|min:2|max:5',
            'home_photos.*' => 'required|image|mimes:jpg,jpeg,png,webp|max:4096',
            'interview_type' => 'required|in:interview,shelter_visit',
            'interview_at' => 'required|date|after:now|before_or_equal:target_date',
            'cosigner_name' => [$minor ? 'required' : 'nullable', 'string', 'max:100', 'different:full_name'],
            'cosigner_phone' => [$minor ? 'required' : 'nullable', 'string', new PhilippineMobile, 'different:phone'],
            'cosigner_birth_date' => [$minor ? 'required' : 'nullable', 'date', 'before_or_equal:'.now()->subYears(18)->toDateString()],
            'cosigner_relationship' => [$minor ? 'required' : 'nullable', 'string', 'max:100'],
            'cosigner_consent' => [$minor ? 'accepted' : 'nullable'],
            'cosigner_id' => [$minor ? 'required' : 'nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:4096'],
            'animal_id' => 'required|exists:animals,id',
            'full_name' => 'required|string|max:100',
            'phone' => ['required', 'string', new PhilippineMobile],
            'address' => 'required|string|max:255',
            'target_date' => 'required|date|after_or_equal:today',
            'message' => 'nullable|string|max:500',
            'agreed' => 'accepted',
            'privacy_consent' => 'accepted',
            'privacy_notice_version' => ['required', \Illuminate\Validation\Rule::in([config('privacy.version')])],
        ]);

        if (! PrivacyNoticeController::ready()) {
            return response()->json(['message' => 'The shelter must publish its privacy contact and retention policy before accepting applications.'], 422);
        }
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

        // foster limit: pets fostered now + requests still waiting
        $limit = $this->limits->for($user);

        if ($limit['remaining'] === 0) {
            return response()->json([
                'message' => "You've reached your limit of {$limit['limit']} pets at a time "
                    ."({$limit['active']} fostering, {$limit['pending']} waiting for an answer). "
                    .'Withdraw a request or finish a foster to apply for another pet.',
                'limit_reached' => true,
            ], 422);
        }

        // The score is always calculated on the server, never trusted from the browser.
        $result = $this->matcher->evaluate($animal, $profile);

        if (! $result['eligible']) {
            return response()->json(['message' => 'At least 60% compatibility is required to apply.'], 422);
        }
        if (! $profile->phone || ! $profile->address || ! $profile->birth_date || ! $profile->emergency_name || ! $profile->emergency_phone) {
            return response()->json(['message' => 'Complete your saved contact, birth date and emergency caretaker details first.'], 422);
        }
        $documents = [];
        $uploads = ['government_id' => $request->file('government_id')];
        foreach ($request->file('home_photos') as $i => $file) {
            $uploads['home_'.($i + 1)] = $file;
        }
        if ($minor) {
            $uploads['cosigner_id'] = $request->file('cosigner_id');
        }
        foreach ($uploads as $key => $file) {
            $path = $file->store('screening', 'local');
            if (! $path) {
                throw new \RuntimeException('Unable to securely store verification documents.');
            }
            $stored[] = $path;
            $documents[$key] = $path;
        }
        $screening = $request->only(['interview_type', 'interview_at', 'cosigner_name', 'cosigner_phone', 'cosigner_birth_date', 'cosigner_relationship']);
        $screening['privacy_consent'] = [
            'accepted_at' => now()->toIso8601String(),
            'notice_version' => config('privacy.version'),
            'notice' => config('privacy'),
            'user_id' => $request->user()->id,
        ];
        $screening['appointment_status'] = 'Requested';
        $screening['requires_cosigner'] = (bool) $minor;
        $screening['cosigner_consent'] = $minor && $request->boolean('cosigner_consent');
        $application = FosterApplication::create([
            'screening' => $screening,
            'documents' => $documents,
            'profile_snapshot' => $profile->toArray(),
            'user_id' => $user->id,
            'animal_id' => $animal->id,
            'full_name' => $user->name,
            'phone' => $profile->phone,
            'address' => $profile->address,
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

    // READ - the volunteer's own foster limit (shown on Matches, pet pages and My applications)
    public function myLimit(Request $request)
    {
        return response()->json($this->limits->for($request->user()));
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

                $data['document_keys'] = array_keys($application->documents ?? []);
                $data['foster_limit'] = $application->user ? $this->limits->for($application->user) : null;

                return $data;
            });

        return response()->json($applications->values());
    }

    // UPDATE - approve or reject
    public function decide(Request $request, FosterApplication $application)
    {
        return DB::transaction(function () use ($request, $application) {
            $application->user()->lockForUpdate()->firstOrFail();
            $application->animal()->lockForUpdate()->firstOrFail();
            $application = $application->newQuery()->lockForUpdate()->findOrFail($application->id);

            return $this->decideLocked($request, $application);
        });
    }

    private function decideLocked(Request $request, FosterApplication $application)
    {
        $validated = $request->validate([
            'status' => 'required|in:Approved,Rejected',
            'staff_notes' => 'required_if:status,Rejected|nullable|string|max:500',
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

        if ($validated['status'] === 'Approved') {
            $profile = $application->user?->volunteerProfile;
            if (! $profile || $profile->review_status !== 'Approved' || ! $this->matcher->evaluate($animal, $profile)['eligible']) {
                return response()->json(['message' => 'The current profile needs approved screening and at least 60% compatibility.'], 422);
            }
            if (! $application->verification_completed_at || ! $application->documents || ! $application->profile_snapshot
                || ($application->profile_snapshot['last_edited_at'] ?? null) !== $profile->toArray()['last_edited_at']) {
                return response()->json(['message' => 'Verify current identity, home photos, co-signer if required, and complete the interview/visit before approval. A changed profile requires a new application.'], 422);
            }
            $limit = $this->limits->for($application->user);

            if ($limit['active'] >= $limit['limit']) {
                return response()->json([
                    'message' => "{$application->full_name} is already fostering {$limit['active']} pets, "
                        ."which is their limit of {$limit['limit']}. Approve this after one of their fosters ends.",
                ], 422);
            }
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

        $limit = $this->limits->for($application->user);

        if ($limit['remaining'] === 0) {
            return response()->json([
                'message' => "{$application->full_name} is at their limit of {$limit['limit']} pets "
                    ."({$limit['active']} fostering, {$limit['pending']} waiting), so this request can't be reopened right now.",
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

    public function schedule(Request $request, FosterApplication $application)
    {
        $validated = $request->validate(['interview_type' => 'required|in:interview,shelter_visit', 'interview_at' => 'required|date|after:now|before_or_equal:'.$application->target_date->toDateString()]);

        return DB::transaction(function () use ($request, $application, $validated) {
            $application->user()->lockForUpdate()->firstOrFail();
            $application = $application->newQuery()->lockForUpdate()->findOrFail($application->id);
            abort_unless($application->status === 'Pending' && $application->screening, 422, 'Only pending applications with a verification package can be scheduled.');
            $screening = array_merge($application->screening, $validated, ['appointment_status' => 'Confirmed', 'scheduled_by' => $request->user()->id]);
            $application->update(['screening' => $screening, 'verification_completed_at' => null, 'verified_by' => null]);
            UserNotification::send($application->user_id, 'Your '.str_replace('_', ' ', $validated['interview_type']).' is confirmed. Check Applications for the date and time.', '/applications');

            return response()->json(['message' => 'Appointment confirmed and applicant notified.']);
        });
    }

    public function document(Request $request, FosterApplication $application, string $key)
    {
        abort_unless(in_array($request->user()->role, ['admin', 'super_admin'], true), 403);
        $path = ($application->documents ?? [])[$key] ?? null;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path, $key.'.'.pathinfo($path, PATHINFO_EXTENSION), ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function verify(Request $request, FosterApplication $application)
    {
        return DB::transaction(function () use ($request, $application) {
            $application->user()->lockForUpdate()->firstOrFail();
            $application = $application->newQuery()->lockForUpdate()->findOrFail($application->id);

            return $this->verifyLocked($request, $application);
        });
    }

    private function verifyLocked(Request $request, FosterApplication $application)
    {
        abort_unless($application->status === 'Pending', 422, 'Only pending applications can be verified.');
        $request->validate([
            'identity_checked' => 'accepted', 'home_checked' => 'accepted',
            'caretaker_checked' => 'accepted', 'interview_completed' => 'accepted',
            'cosigner_checked' => ($application->screening['requires_cosigner'] ?? false) ? 'accepted' : 'nullable',
        ]);
        $profile = $application->user->volunteerProfile;
        abort_unless($application->documents && $application->profile_snapshot && $profile?->review_status === 'Approved'
            && ($application->profile_snapshot['last_edited_at'] ?? null) === $profile->toArray()['last_edited_at'], 422, 'Current screened profile and verification documents are required. Submit a new application after profile changes.');
        $requiredKeys = ['government_id', 'home_1', 'home_2'];
        if ($application->screening['requires_cosigner'] ?? false) {
            $requiredKeys[] = 'cosigner_id';
        }
        foreach ($requiredKeys as $key) {
            $path = ($application->documents ?? [])[$key] ?? null;
            abort_unless($path && Storage::disk('local')->exists($path), 422, 'Required verification documents are missing. Ask the applicant to resubmit.');
        }
        abort_unless(($application->screening['appointment_status'] ?? null) === 'Confirmed', 422, 'Confirm the interview or shelter visit schedule first.');
        abort_unless(Carbon::parse($application->screening['interview_at'])->isPast(), 422, 'The scheduled interview or visit must take place before verification.');
        $application->update(['verification_completed_at' => now(), 'verified_by' => $request->user()->id]);

        return response()->json(['message' => 'Verification recorded. You may now decide this application.']);
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

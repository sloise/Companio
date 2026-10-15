<?php

namespace App\Http\Controllers;

use App\Models\AnimalEvent;
use App\Models\Placement;
use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlacementController extends Controller
{
    // ---------------------------------------------------------------
    // ADMIN
    // ---------------------------------------------------------------

    // READ - placements with a foster request ("wants to adopt / return") come first
    public function index(Request $request)
    {
        $placements = Placement::with(['animal', 'application.user'])
            ->when($request->status, fn ($q, $value) => $q->where('status', $value))
            ->orderByRaw("CASE WHEN status = 'Active' AND foster_request IS NOT NULL THEN 0 ELSE 1 END")
            ->latest('id')
            ->get();

        return response()->json($placements);
    }

    // UPDATE - change status / dates / notes
    // Returned => the animal is available again, Adopted => the animal is adopted
    public function update(Request $request, Placement $placement)
    {
        $validated = $request->validate([
            'status' => 'required|in:Active,Returned,Adopted',
            'expected_return_date' => 'nullable|date',
            'notes' => 'nullable|string|max:500',
        ]);

        $oldStatus = $placement->status;
        $admin = $request->user();

        DB::transaction(function () use ($placement, $validated, $oldStatus, $admin) {
            $placement->update($validated);

            $animalStatus = match ($validated['status']) {
                'Returned' => 'Awaiting Foster',
                'Adopted' => 'Adopted',
                default => 'In Foster Care',
            };

            $animal = $placement->animal;
            $animal->update(['status' => $animalStatus]);

            if ($oldStatus === $validated['status']) {
                return;
            }

            $fosterName = $placement->application?->full_name ?? 'the foster';
            $fosterId = $placement->application?->user_id;
            $askedToAdopt = $placement->foster_request === 'adopt';

            if ($validated['status'] === 'Returned') {
                AnimalEvent::log($animal->id, "{$admin->name} marked {$animal->name} as returned to the shelter by {$fosterName}", $admin->id);
                $message = "Thank you for fostering {$animal->name}! The shelter recorded their return.";
            } elseif ($validated['status'] === 'Adopted') {
                AnimalEvent::log($animal->id, "{$admin->name} marked {$animal->name} as adopted" . ($askedToAdopt ? " by {$fosterName}" : ''), $admin->id);
                $message = $askedToAdopt
                    ? "Congratulations! Your adoption of {$animal->name} is confirmed. 🎉"
                    : "{$animal->name} has been adopted! Thank you for fostering them.";
            } else {
                AnimalEvent::log($animal->id, "{$admin->name} set the placement with {$fosterName} back to active", $admin->id);
                $message = null;
            }

            if ($fosterId && $message) {
                UserNotification::send($fosterId, $message, '/applications');
            }
        });

        return response()->json([
            'message' => 'Placement updated successfully.',
            'placement' => $placement->fresh()->load(['animal', 'application.user']),
        ]);
    }

    // DELETE - "keep fostering": the shelter turns down the foster's adopt / return request for now
    public function clearRequest(Request $request, Placement $placement)
    {
        if (! $placement->foster_request) {
            return response()->json(['message' => 'There is no request to answer.'], 422);
        }

        $admin = $request->user();
        $animal = $placement->animal;
        $wanted = $placement->foster_request === 'adopt' ? 'adoption' : 'return';

        DB::transaction(function () use ($placement, $animal, $admin, $wanted) {
            $placement->update([
                'foster_request' => null,
                'foster_request_note' => null,
                'foster_requested_at' => null,
            ]);

            AnimalEvent::log($animal->id, "{$admin->name} answered the {$wanted} request: {$animal->name} stays in foster care for now", $admin->id);

            if ($placement->application?->user_id) {
                UserNotification::send(
                    $placement->application->user_id,
                    "The shelter replied to your {$wanted} request: {$animal->name} stays with you for now. They'll be in touch.",
                    '/applications'
                );
            }
        });

        return response()->json(['message' => "Request answered. {$animal->name} stays in foster care."]);
    }

    // ---------------------------------------------------------------
    // VOLUNTEER (the foster)
    // ---------------------------------------------------------------

    // UPDATE - the foster asks to adopt or to return the pet
    public function requestEnd(Request $request, Placement $placement)
    {
        $validated = $request->validate([
            'type' => 'required|in:adopt,return',
            'note' => 'nullable|string|max:500',
        ]);

        if ($placement->application?->user_id !== $request->user()->id) {
            return response()->json(['message' => 'This is not your foster placement.'], 403);
        }

        if ($placement->status !== 'Active') {
            return response()->json(['message' => 'This placement has already ended.'], 422);
        }

        $animal = $placement->animal;

        $placement->update([
            'foster_request' => $validated['type'],
            'foster_request_note' => $validated['note'] ?? null,
            'foster_requested_at' => now(),
        ]);

        AnimalEvent::log(
            $animal->id,
            $validated['type'] === 'adopt'
                ? "{$placement->application->full_name} asked to adopt {$animal->name}"
                : "{$placement->application->full_name} asked to return {$animal->name} to the shelter",
            $request->user()->id
        );

        return response()->json([
            'message' => $validated['type'] === 'adopt'
                ? "Adoption request sent! The shelter will contact you about the next steps."
                : "Return request sent. The shelter will contact you to arrange it.",
            'placement' => $placement->fresh(),
        ]);
    }

    // DELETE - the foster changes their mind
    public function cancelRequest(Request $request, Placement $placement)
    {
        if ($placement->application?->user_id !== $request->user()->id) {
            return response()->json(['message' => 'This is not your foster placement.'], 403);
        }

        if ($placement->status !== 'Active' || ! $placement->foster_request) {
            return response()->json(['message' => 'There is no open request to cancel.'], 422);
        }

        $placement->update([
            'foster_request' => null,
            'foster_request_note' => null,
            'foster_requested_at' => null,
        ]);

        AnimalEvent::log($placement->animal_id, "{$placement->application->full_name} cancelled their request", $request->user()->id);

        return response()->json(['message' => 'Request cancelled.', 'placement' => $placement->fresh()]);
    }
}

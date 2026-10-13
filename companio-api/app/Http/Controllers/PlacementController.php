<?php

namespace App\Http\Controllers;

use App\Models\AnimalEvent;
use App\Models\Placement;
use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlacementController extends Controller
{
    // READ
    public function index(Request $request)
    {
        $placements = Placement::with(['animal', 'application.user'])
            ->when($request->status, fn ($q, $value) => $q->where('status', $value))
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

            if ($validated['status'] === 'Returned') {
                AnimalEvent::log($animal->id, "{$admin->name} marked {$animal->name} as returned to the shelter by {$fosterName}", $admin->id);
                $message = "Thank you for fostering {$animal->name}! The shelter recorded their return.";
            } elseif ($validated['status'] === 'Adopted') {
                AnimalEvent::log($animal->id, "{$admin->name} marked {$animal->name} as adopted", $admin->id);
                $message = "{$animal->name} has been adopted! Thank you for fostering them.";
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
}

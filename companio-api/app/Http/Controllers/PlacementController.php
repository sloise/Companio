<?php

namespace App\Http\Controllers;

use App\Models\Placement;
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

        DB::transaction(function () use ($placement, $validated) {
            $placement->update($validated);

            $animalStatus = match ($validated['status']) {
                'Returned' => 'Awaiting Foster',
                'Adopted' => 'Adopted',
                default => 'In Foster Care',
            };

            $placement->animal->update(['status' => $animalStatus]);
        });

        return response()->json([
            'message' => 'Placement updated successfully.',
            'placement' => $placement->fresh()->load(['animal', 'application.user']),
        ]);
    }
}

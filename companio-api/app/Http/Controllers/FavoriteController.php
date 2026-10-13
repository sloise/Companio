<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use Illuminate\Http\Request;

// Pets a volunteer saved with the heart button
class FavoriteController extends Controller
{
    // READ - saved pets with their current status (to spot pets that found a home)
    public function index(Request $request)
    {
        $animals = $request->user()->favoriteAnimals()
            ->get(['animals.id', 'animals.name', 'animals.species', 'animals.status']);

        return response()->json($animals->map(fn ($animal) => [
            'id' => $animal->id,
            'name' => $animal->name,
            'species' => $animal->species,
            'status' => $animal->status,
            'open' => in_array($animal->status, Animal::OPEN_STATUSES, true),
        ]));
    }

    // CREATE - save a pet
    public function store(Request $request, Animal $animal)
    {
        $request->user()->favoriteAnimals()->syncWithoutDetaching([$animal->id]);

        return response()->json(['message' => "{$animal->name} saved."], 201);
    }

    // DELETE - unsave a pet
    public function destroy(Request $request, Animal $animal)
    {
        $request->user()->favoriteAnimals()->detach($animal->id);

        return response()->json(['message' => "{$animal->name} removed from saved pets."]);
    }
}

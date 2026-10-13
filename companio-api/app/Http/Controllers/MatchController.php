<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Services\MatchService;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function __construct(private MatchService $matcher)
    {
    }

    // READ - the match feed (animals the volunteer can apply for, scored)
    // Optional query: search, species (dog|cat), urgent (1), min_match (default 60), sort (match|urgent|newest)
    public function index(Request $request)
    {
        $profile = $request->user()->volunteerProfile;

        if (! $profile) {
            return response()->json([
                'message' => 'Please answer the home questionnaire first.',
                'needs_profile' => true,
            ], 422);
        }

        $animals = Animal::whereIn('status', Animal::OPEN_STATUSES)
            ->when($request->search, fn ($q, $value) => $q->where('name', 'like', "%{$value}%"))
            ->when($request->species, fn ($q, $value) => $q->where('species', $value))
            ->when($request->boolean('urgent'), fn ($q) => $q->where('is_urgent', true))
            ->get();

        $minMatch = (int) $request->query('min_match', 60);
        $sort = $request->query('sort', 'match');

        $results = $animals
            ->map(fn ($animal) => array_merge(
                $animal->toArray(),
                ['match' => $this->matcher->evaluate($animal, $profile)]
            ))
            ->filter(fn ($row) => $row['match']['score'] >= $minMatch)
            ->sort(function ($a, $b) use ($sort) {
                if ($sort === 'urgent') {
                    return [$b['is_urgent'], $b['match']['score']] <=> [$a['is_urgent'], $a['match']['score']];
                }
                if ($sort === 'newest') {
                    return $b['id'] <=> $a['id'];
                }
                return [$b['match']['score'], $b['is_urgent']] <=> [$a['match']['score'], $a['is_urgent']];
            })
            ->values();

        return response()->json($results);
    }

    // READ SINGLE RECORD - one animal with its match breakdown
    public function show(Request $request, Animal $animal)
    {
        $profile = $request->user()->volunteerProfile;

        if (! $profile) {
            return response()->json([
                'message' => 'Please answer the home questionnaire first.',
                'needs_profile' => true,
            ], 422);
        }

        return response()->json(array_merge(
            $animal->toArray(),
            ['match' => $this->matcher->evaluate($animal, $profile)]
        ));
    }
}

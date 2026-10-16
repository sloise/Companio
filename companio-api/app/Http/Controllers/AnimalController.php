<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\AnimalEvent;
use Illuminate\Http\Request;

// Admin CRUD for rescue animal profiles
class AnimalController extends Controller
{
    private function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'species' => 'required|in:dog,cat',
            'breed' => 'nullable|string|max:100',
            'sex' => 'nullable|in:Male,Female',
            'age' => 'required|string|max:30',
            'description' => 'nullable|string|max:1000',
            // either a normal image link or an uploaded image (base64 data URL, max ~2 MB)
            'photo_url' => ['nullable', 'string', 'max:2000000', function ($attribute, $value, $fail) {
                $isLink = filter_var($value, FILTER_VALIDATE_URL);
                $isUpload = preg_match('/^data:image\/(jpeg|png|webp|gif);base64,/', $value);

                if (! $isLink && ! $isUpload) {
                    $fail('The photo must be an image link or an uploaded image.');
                }
            }],
            'apartment_ok' => 'required|boolean',
            'needs_yard' => 'required|boolean',
            'good_with_cats' => 'required|boolean',
            'good_with_dogs' => 'required|boolean',
            'kids_ok' => 'required|in:any,older,none',
            'max_hours_alone' => 'required|in:4,8,12',
            'is_urgent' => 'required|boolean',
            'needed_by' => 'nullable|date',
            'status' => 'required|in:Awaiting Foster,Under Review,In Foster Care,Adopted',
        ];
    }

    // READ
    public function index(Request $request)
    {
        $animals = Animal::query()
            ->when($request->search, fn ($q, $value) => $q->where('name', 'like', "%{$value}%"))
            ->when($request->species, fn ($q, $value) => $q->where('species', $value))
            ->when($request->status, fn ($q, $value) => $q->where('status', $value))
            ->latest('id')
            ->get();

        return response()->json($animals);
    }

    // CREATE
    public function store(Request $request)
    {
        $validated = $this->withDeadline($request->validate($this->rules()));

        if ($duplicate = $this->findDuplicate($validated)) {
            return $this->duplicateResponse($duplicate);
        }

        $animal = Animal::create($validated);

        AnimalEvent::log($animal->id, "Added to Companio by {$request->user()->name}", $request->user()->id);

        return response()->json([
            'message' => 'Animal profile created successfully.',
            'animal' => $animal,
        ], 201);
    }

    // READ SINGLE RECORD
    public function show(Animal $animal)
    {
        return response()->json($animal);
    }

    // UPDATE
    public function update(Request $request, Animal $animal)
    {
        $validated = $this->withDeadline($request->validate($this->rules()));

        if ($duplicate = $this->findDuplicate($validated, $animal->id)) {
            return $this->duplicateResponse($duplicate);
        }

        $oldStatus = $animal->status;

        $animal->update($validated);

        if ($oldStatus !== $animal->status) {
            AnimalEvent::log(
                $animal->id,
                "Status changed from {$oldStatus} to {$animal->status} by {$request->user()->name}",
                $request->user()->id
            );
        }

        return response()->json([
            'message' => 'Animal profile updated successfully.',
            'animal' => $animal,
        ]);
    }

    // READ - everything that happened to this animal, newest first
    public function history(Animal $animal)
    {
        $events = $animal->events()
            ->latest('id')
            ->get(['id', 'message', 'created_at'])
            ->toArray();

        // animals added before history was recorded still show when they were added
        $hasAddedEvent = collect($events)->contains(fn ($event) => str_starts_with($event['message'], 'Added to Companio'));

        if (! $hasAddedEvent) {
            $events[] = ['id' => 0, 'message' => 'Added to Companio', 'created_at' => $animal->created_at];
        }

        return response()->json($events);
    }

    // Another animal with the same name, species, breed, sex and age (capitals and spaces ignored).
    // Pets that only share a name (two dogs called "Max") are still allowed.
    private function findDuplicate(array $data, ?int $ignoreId = null): ?Animal
    {
        $clean = fn ($value) => mb_strtolower(trim((string) $value));

        return Animal::query()
            ->whereRaw('LOWER(TRIM(name)) = ?', [$clean($data['name'])])
            ->where('species', $data['species'])
            ->whereRaw("LOWER(TRIM(COALESCE(breed, ''))) = ?", [$clean($data['breed'] ?? '')])
            ->whereRaw("COALESCE(sex, '') = ?", [$data['sex'] ?? ''])
            ->whereRaw('LOWER(TRIM(age)) = ?', [$clean($data['age'])])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->first();
    }

    private function duplicateResponse(Animal $duplicate)
    {
        $details = collect([
            $duplicate->species === 'cat' ? 'cat' : 'dog',
            $duplicate->breed,
            $duplicate->sex,
            $duplicate->age,
        ])->filter()->implode(', ');

        return response()->json([
            'message' => "{$duplicate->name} ({$details}) is already in the list.",
            'errors' => [
                'name' => ["{$duplicate->name} ({$details}) is already in the list, so this would be a duplicate. "
                    . 'Edit the existing animal instead, or change the details if this is a different pet.'],
            ],
            'duplicate_id' => $duplicate->id,
        ], 422);
    }

    // only urgent animals keep a "needs a home by" date
    private function withDeadline(array $validated): array
    {
        if (! $validated['is_urgent']) {
            $validated['needed_by'] = null;
        }

        return $validated;
    }

    // DELETE
    public function destroy(Animal $animal)
    {
        $animal->delete();

        return response()->json([
            'message' => 'Animal profile deleted successfully.',
        ]);
    }
}

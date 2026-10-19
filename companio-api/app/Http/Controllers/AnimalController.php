<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\AnimalEvent;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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
            'birth_date' => 'nullable|date_format:Y-m-d|before_or_equal:today',
            'estimated_age_years' => 'nullable|integer|min:0|max:100',
            'estimated_age_months' => 'nullable|integer|min:0|max:11',
            'health_status' => 'required|in:Vaccinated,Vaccination Due Soon,Not Yet Vaccinated,Records Unavailable',
            'sterilization_status' => ['required', Rule::in(Animal::sterilizationOptions(request('sex')))],
            'vaccinations' => 'nullable|array|max:8',
            'vaccinations.*' => 'array:type,other_name,vaccinated_at,next_due_at',
            'vaccinations.*.type' => ['required', 'distinct', Rule::in(request('species') === 'cat' ? ['Anti-Rabies', '3-in-1 (FVRCP)', '4-in-1', 'FeLV Vaccine', 'Other'] : ['Anti-Rabies', '3-in-1', '4-in-1', '5-in-1', '6-in-1', '8-in-1', 'Other'])],
            'vaccinations.*.other_name' => 'required_if:vaccinations.*.type,Other|nullable|string|max:100',
            'vaccinations.*.vaccinated_at' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today', ...(request('birth_date') ? ['after_or_equal:birth_date'] : [])],
            'vaccinations.*.next_due_at' => 'nullable|date_format:Y-m-d',
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
            'care_rules_confirmed' => 'accepted',
            'urgent_reason' => ['nullable', 'required_if:is_urgent,true', Rule::in(Animal::URGENT_REASONS)],
            'urgent_notes' => 'nullable|string|max:500',
            'is_urgent' => 'required|boolean',
            'needed_by' => 'required_if:is_urgent,true|nullable|date_format:Y-m-d',
            'status' => 'sometimes|in:Awaiting Foster,Under Review,In Foster Care,Adopted',
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

        $validated['status'] = 'Awaiting Foster';
        unset($validated['care_rules_confirmed']);
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

        // Placement and application workflows own status transitions.
        unset($validated['status'], $validated['care_rules_confirmed']);
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
            'animal' => $animal->fresh(),
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
            ->where('birth_date', $data['birth_date'])
            ->when(! $data['birth_date'], fn ($q) => $q->where('estimated_age_years', $data['estimated_age_years'])->where('estimated_age_months', $data['estimated_age_months'])->where('age', $data['age']))
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
                    .'Edit the existing animal instead, or change the details if this is a different pet.'],
            ],
            'duplicate_id' => $duplicate->id,
        ], 422);
    }

    // only urgent animals keep a "needs a home by" date
    private function withDeadline(array $validated): array
    {
        $validated['birth_date'] = $validated['birth_date'] ?? null;
        $validated['estimated_age_years'] = $validated['birth_date'] ? null : ($validated['estimated_age_years'] ?? null);
        $validated['estimated_age_months'] = $validated['birth_date'] ? null : ($validated['estimated_age_months'] ?? null);
        if ($validated['estimated_age_years'] !== null || $validated['estimated_age_months'] !== null) {
            $validated['estimated_age_years'] ??= 0;
            $validated['estimated_age_months'] ??= 0;
        }
        $validated['age'] = (new Animal($validated))->age;
        $status = $validated['health_status'] ?? 'Records Unavailable';
        $vaccinations = $validated['vaccinations'] ?? [];
        if (in_array($status, ['Vaccinated', 'Vaccination Due Soon'], true) && ! count($vaccinations)) {
            throw ValidationException::withMessages(['vaccinations' => 'Select at least one vaccine record.']);
        }
        if ($status === 'Vaccination Due Soon' && collect($vaccinations)->contains(fn ($v) => empty($v['next_due_at']))) {
            throw ValidationException::withMessages(['vaccinations' => 'A next due date is required for each vaccine marked due soon.']);
        }
        if (in_array($status, ['Not Yet Vaccinated', 'Records Unavailable'], true) && count($vaccinations)) {
            throw ValidationException::withMessages(['vaccinations' => 'Choose a vaccinated health status before adding vaccine records.']);
        }
        foreach ($vaccinations as $index => &$vaccine) {
            $vaccine['vaccinated_at'] = $vaccine['vaccinated_at'] ?? null;
            $vaccine['next_due_at'] = $vaccine['next_due_at'] ?? null;
            if ($vaccine['vaccinated_at'] && $vaccine['next_due_at'] && $vaccine['next_due_at'] < $vaccine['vaccinated_at']) {
                throw ValidationException::withMessages(["vaccinations.$index.next_due_at" => 'The next due date must be on or after the vaccination date.']);
            }
        }
        unset($vaccine);
        $validated['vaccinations'] = $vaccinations;
        if (! $validated['is_urgent']) {
            $validated['needed_by'] = null;
            $validated['urgent_reason'] = null;
            $validated['urgent_notes'] = null;
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

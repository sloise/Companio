<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Animal extends Model
{
    // The four placement stages from the proposal
    public const STATUSES = ['Awaiting Foster', 'Under Review', 'In Foster Care', 'Adopted'];

    // Animals volunteers can still apply for
    public const OPEN_STATUSES = ['Awaiting Foster', 'Under Review'];

    public const URGENT_REASONS = ['Medical care', 'Shelter capacity', 'Transport deadline'];

    protected static function booted(): void
    {
        static::saving(function (Animal $animal) {
            if ($animal->status === 'In Foster Care' || ! $animal->is_urgent) {
                $animal->is_urgent = false;
                $animal->needed_by = null;
                $animal->urgent_reason = null;
                $animal->urgent_notes = null;
            } elseif (! $animal->needed_by) {
                $animal->needed_by = today()->addDays(14);
            }
        });
        static::saved(function (Animal $animal) {
            if ($animal->wasChanged(['health_status', 'vaccinations', 'sterilization_status', 'description'])) {
                foreach ($animal->placements()->where('status', 'Active')->with('application')->get() as $placement) {
                    if ($placement->application?->user_id) {
                        UserNotification::send($placement->application->user_id, "Care information for {$animal->name} has been updated by the shelter.", '/matches/'.$animal->id);
                    }
                }
            }

            $fields = ['is_urgent', 'needed_by', 'urgent_reason', 'urgent_notes'];
            if (($animal->wasRecentlyCreated && $animal->is_urgent) || (! $animal->wasRecentlyCreated && $animal->wasChanged($fields))) {
                $before = collect($animal->getPrevious())->only($fields)->toJson();
                $after = collect($animal->attributesToArray())->only($fields)->toJson();
                AnimalEvent::log($animal->id, "Urgency changed from {$before} to {$after}", auth()->id());
            }
        });
    }

    protected $hidden = ['shelter_key'];

    protected $fillable = [
        'estimated_age_years', 'estimated_age_months',
        'birth_date', 'health_status', 'vaccinations', 'sterilization_status',
        'urgent_reason', 'urgent_notes',
        'name',
        'species',
        'breed',
        'sex',
        'age',
        'description',
        'photo_url',
        'apartment_ok',
        'needs_yard',
        'good_with_cats',
        'good_with_dogs',
        'kids_ok',
        'max_hours_alone',
        'is_urgent',
        'needed_by',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'estimated_age_years' => 'integer', 'estimated_age_months' => 'integer',
            'birth_date' => 'date:Y-m-d',
            'vaccinations' => 'array',
            'apartment_ok' => 'boolean',
            'needs_yard' => 'boolean',
            'good_with_cats' => 'boolean',
            'good_with_dogs' => 'boolean',
            'is_urgent' => 'boolean',
            'max_hours_alone' => 'integer',
            'needed_by' => 'date:Y-m-d',
        ];
    }

    public function getAgeAttribute($value): string
    {
        if (! $this->birth_date) {
            if ($this->estimated_age_years !== null || $this->estimated_age_months !== null) {
                $years = $this->estimated_age_years ?? 0;
                $months = $this->estimated_age_months ?? 0;
                $parts = [];
                if ($years) {
                    $parts[] = $years.' year'.($years === 1 ? '' : 's');
                }
                if ($months) {
                    $parts[] = $months.' month'.($months === 1 ? '' : 's');
                }

                return $parts ? implode(' and ', $parts) : '0 months';
            }

            return trim((string) $value) ?: 'Age Unknown';
        }
        $birth = $this->birth_date;
        $today = today();
        $months = max(0, ($today->year - $birth->year) * 12 + $today->month - $birth->month - ($today->day < $birth->day ? 1 : 0));
        $years = intdiv($months, 12);
        $remaining = $months % 12;
        $parts = [];
        if ($years) {
            $parts[] = $years.' year'.($years === 1 ? '' : 's');
        }
        if ($remaining) {
            $parts[] = $remaining.' month'.($remaining === 1 ? '' : 's');
        }

        return $parts ? implode(' and ', $parts) : (int) $birth->diffInDays($today).' day'.((int) $birth->diffInDays($today) === 1 ? '' : 's');
    }

    public static function sterilizationOptions(?string $sex): array
    {
        return match ($sex) {
            'Female' => ['Spayed', 'Not Yet Spayed', 'Unknown'],
            'Male' => ['Neutered', 'Not Yet Neutered', 'Unknown'],
            default => ['Unknown'],
        };
    }

    public function applications()
    {
        return $this->hasMany(FosterApplication::class);
    }

    public function placements()
    {
        return $this->hasMany(Placement::class);
    }

    public function events()
    {
        return $this->hasMany(AnimalEvent::class);
    }
}

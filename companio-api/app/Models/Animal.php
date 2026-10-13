<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Animal extends Model
{
    // The four placement stages from the proposal
    public const STATUSES = ['Awaiting Foster', 'Under Review', 'In Foster Care', 'Adopted'];

    // Animals volunteers can still apply for
    public const OPEN_STATUSES = ['Awaiting Foster', 'Under Review'];

    protected $fillable = [
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
            'apartment_ok' => 'boolean',
            'needs_yard' => 'boolean',
            'good_with_cats' => 'boolean',
            'good_with_dogs' => 'boolean',
            'is_urgent' => 'boolean',
            'max_hours_alone' => 'integer',
            'needed_by' => 'date:Y-m-d',
        ];
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

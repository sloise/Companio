<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VolunteerProfile extends Model
{
    protected $fillable = [
        'phone', 'address', 'birth_date', 'emergency_name', 'emergency_phone',
        'review_status', 'review_notes', 'reviewed_by', 'last_edited_at',
        'user_id',
        'housing_type',
        'yard',
        'has_cats',
        'has_dogs',
        'kids',
        'hours_alone',
        'experience',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date:Y-m-d',
            'last_edited_at' => 'datetime',
            'has_cats' => 'boolean',
            'has_dogs' => 'boolean',
            'hours_alone' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

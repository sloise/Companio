<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VolunteerProfile extends Model
{
    protected $fillable = [
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

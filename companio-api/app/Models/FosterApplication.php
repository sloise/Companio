<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FosterApplication extends Model
{
    protected $fillable = [
        'user_id',
        'animal_id',
        'full_name',
        'phone',
        'address',
        'target_date',
        'message',
        'match_score',
        'status',
        'staff_notes',
    ];

    protected function casts(): array
    {
        return [
            'target_date' => 'date:Y-m-d',
            'match_score' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function animal()
    {
        return $this->belongsTo(Animal::class);
    }

    public function placement()
    {
        return $this->hasOne(Placement::class);
    }
}

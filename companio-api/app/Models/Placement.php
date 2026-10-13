<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Placement extends Model
{
    protected $fillable = [
        'foster_application_id',
        'animal_id',
        'foster_start_date',
        'expected_return_date',
        'notes',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'foster_start_date' => 'date:Y-m-d',
            'expected_return_date' => 'date:Y-m-d',
        ];
    }

    public function application()
    {
        return $this->belongsTo(FosterApplication::class, 'foster_application_id');
    }

    public function animal()
    {
        return $this->belongsTo(Animal::class);
    }
}

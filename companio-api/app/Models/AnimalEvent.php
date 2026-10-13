<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnimalEvent extends Model
{
    protected $fillable = [
        'animal_id',
        'user_id',
        'message',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // Add a line to an animal's history. $userId = who did it (null for the system).
    public static function log(int $animalId, string $message, ?int $userId = null): self
    {
        return self::create([
            'animal_id' => $animalId,
            'user_id' => $userId,
            'message' => $message,
        ]);
    }
}

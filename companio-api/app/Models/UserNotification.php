<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserNotification extends Model
{
    protected $fillable = [
        'user_id',
        'message',
        'link',
        'read_at',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    // Send an in-app notification to one user
    public static function send(int $userId, string $message, ?string $link = null): self
    {
        return self::create([
            'user_id' => $userId,
            'message' => $message,
            'link' => $link,
        ]);
    }
}

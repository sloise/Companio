<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'photo_url',
        'name',
        'email',
        'password',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'shelter_id_path',
        'shelter_key',
        'archived_email', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',   // passwords are hashed automatically when saved
        ];
    }

    public function volunteerProfile()
    {
        return $this->hasOne(VolunteerProfile::class);
    }

    public function applications()
    {
        return $this->hasMany(FosterApplication::class);
    }

    // pets saved with the heart button
    public function favoriteAnimals()
    {
        return $this->belongsToMany(Animal::class, 'favorites')->withTimestamps();
    }

    public function appNotifications()
    {
        return $this->hasMany(UserNotification::class);
    }
}

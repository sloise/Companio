<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FosterApplication extends Model
{
    protected $fillable = [
        'screening', 'documents', 'profile_snapshot', 'verification_completed_at', 'verified_by',
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
        'decided_by',
        'decided_at',
    ];

    protected $hidden = ['documents'];

    protected function casts(): array
    {
        return [
            'screening' => 'array',
            'documents' => 'array',
            'profile_snapshot' => 'array',
            'verification_completed_at' => 'datetime',
            'target_date' => 'date:Y-m-d',
            'match_score' => 'integer',
            'decided_at' => 'datetime',
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

    // the staff member who approved / rejected it
    public function decider()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}

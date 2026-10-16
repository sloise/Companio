<?php

namespace App\Services;

use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\User;

/**
 * How many pets one volunteer may foster at the same time.
 *
 *   Everyone:  2 pets
 *   3 pets if  (experienced OR has finished a foster before)
 *          AND lives in a house or townhouse
 *          AND is away 8 hours or less a day
 *
 * "Used" = pets they foster right now + requests still waiting for an answer.
 */
class FosterLimit
{
    public const BASE = 2;

    public const MAX = 3;

    /**
     * @return array{limit:int, active:int, pending:int, used:int, remaining:int, completed:int, reasons:array<int,string>}
     */
    public function for(User $user): array
    {
        $profile = $user->volunteerProfile;

        $active = Placement::where('status', 'Active')
            ->whereHas('application', fn ($q) => $q->where('user_id', $user->id))
            ->count();

        $pending = FosterApplication::where('user_id', $user->id)
            ->where('status', 'Pending')
            ->count();

        $completed = Placement::whereIn('status', ['Returned', 'Adopted'])
            ->whereHas('application', fn ($q) => $q->where('user_id', $user->id))
            ->count();

        // what's still missing for the higher limit (empty = they get the higher limit)
        $missing = [];

        if (! $profile || ($profile->experience !== 'experienced' && $completed === 0)) {
            $missing[] = 'be an experienced pet carer or finish your first foster';
        }
        if (! $profile || ! in_array($profile->housing_type, ['house', 'townhouse'], true)) {
            $missing[] = 'live in a house or townhouse';
        }
        if (! $profile || (int) $profile->hours_alone > 8) {
            $missing[] = 'be away 8 hours or less a day';
        }

        $limit = $missing ? self::BASE : self::MAX;
        $used = $active + $pending;

        return [
            'limit' => $limit,
            'active' => $active,
            'pending' => $pending,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'completed' => $completed,
            'reasons' => $missing, // shown as "To foster 3 pets at once you'd need to: ..."
        ];
    }
}

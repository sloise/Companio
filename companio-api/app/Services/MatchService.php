<?php

namespace App\Services;

use App\Models\Animal;
use App\Models\VolunteerProfile;

/**
 * Compatibility matching engine.
 *
 * Five care rules are checked, each worth 20%:
 *   Housing, Yard, Other pets, Children, Time alone
 * So a score is 100, 80, 60, 40 or 20 percent.
 */
class MatchService
{
    private const HOUSING = [
        'apartment' => 'Apartment / condo',
        'house' => 'House',
        'townhouse' => 'Townhouse',
        'dormitory' => 'Dormitory / boarding',
    ];

    private const YARD = [
        'none' => 'No yard',
        'small' => 'Small or shared yard',
        'fenced' => 'Fenced yard',
    ];

    private const KIDS_HOME = [
        'none' => 'No children',
        'older' => 'Children 10 and up',
        'young' => 'Children under 10',
    ];

    private const KIDS_NEED = [
        'any' => 'OK with children of any age',
        'older' => 'Children 10 and up only',
        'none' => 'No children in the home',
    ];

    private const HOURS_HOME = [
        4 => 'Under 4 hours alone',
        8 => '4-8 hours alone',
        12 => 'More than 8 hours alone',
    ];

    private const HOURS_NEED = [
        4 => 'Up to 4 hours alone',
        8 => 'Up to 8 hours alone',
        12 => 'Can be alone 8+ hours',
    ];

    /**
     * @return array{score:int, checks:array<int, array{key:string,label:string,need:string,home:string,ok:bool}>}
     */
    public function evaluate(Animal $animal, VolunteerProfile $profile): array
    {
        $checks = [];

        // 1. HOUSING - animals that cannot live in small spaces need a house
        $smallHome = in_array($profile->housing_type, ['apartment', 'dormitory'], true);
        $checks[] = $this->check(
            'housing',
            'Housing',
            $animal->apartment_ok ? 'Fine in an apartment' : 'Needs a house',
            self::HOUSING[$profile->housing_type] ?? (string) $profile->housing_type,
            $animal->apartment_ok || ! $smallHome
        );

        // 2. YARD - some dogs need a fenced yard
        $checks[] = $this->check(
            'yard',
            'Yard',
            $animal->needs_yard ? 'Needs a fenced yard' : 'No yard needed',
            self::YARD[$profile->yard] ?? (string) $profile->yard,
            ! $animal->needs_yard || $profile->yard === 'fenced'
        );

        // 3. OTHER PETS - must get along with the cats / dogs already at home
        $petsOk = (! $profile->has_cats || $animal->good_with_cats)
            && (! $profile->has_dogs || $animal->good_with_dogs);

        $petsHome = [];
        if ($profile->has_cats) {
            $petsHome[] = 'Cat(s)';
        }
        if ($profile->has_dogs) {
            $petsHome[] = 'Dog(s)';
        }

        $checks[] = $this->check(
            'pets',
            'Other pets',
            ($animal->good_with_cats ? 'Fine with cats' : 'No other cats')
                . ', '
                . ($animal->good_with_dogs ? 'fine with dogs' : 'no other dogs'),
            $petsHome ? implode(' and ', $petsHome) : 'No other pets',
            $petsOk
        );

        // 4. CHILDREN
        $kidsOk = match ($profile->kids) {
            'none' => true,
            'older' => in_array($animal->kids_ok, ['any', 'older'], true),
            default => $animal->kids_ok === 'any',   // young children
        };
        $checks[] = $this->check(
            'kids',
            'Children',
            self::KIDS_NEED[$animal->kids_ok] ?? (string) $animal->kids_ok,
            self::KIDS_HOME[$profile->kids] ?? (string) $profile->kids,
            $kidsOk
        );

        // 5. TIME ALONE - the volunteer's hours away must not exceed the animal's limit
        $checks[] = $this->check(
            'hours',
            'Time alone',
            self::HOURS_NEED[$animal->max_hours_alone] ?? ($animal->max_hours_alone . ' hours'),
            self::HOURS_HOME[$profile->hours_alone] ?? ($profile->hours_alone . ' hours'),
            $animal->max_hours_alone >= $profile->hours_alone
        );

        $met = count(array_filter($checks, fn ($c) => $c['ok']));

        return [
            'score' => (int) round($met / count($checks) * 100),
            'checks' => $checks,
        ];
    }

    private function check(string $key, string $label, string $need, string $home, bool $ok): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'need' => $need,
            'home' => $home,
            'ok' => $ok,
        ];
    }
}

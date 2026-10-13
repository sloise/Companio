<?php

namespace Database\Seeders;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\User;
use App\Models\VolunteerProfile;
use App\Services\MatchService;
use Illuminate\Database\Seeder;

/**
 * Demo data for Companio.  Run with:  php artisan migrate:fresh --seed
 *
 * Logins (password for all of them is: password)
 *   admin@companio.test    shelter admin
 *   andrea@companio.test   volunteer with a finished questionnaire (no requests yet)
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $matcher = new MatchService();

        // ------------------------------------------------------------
        // Users
        // ------------------------------------------------------------
        User::create([
            'name' => 'Maria Santos',
            'email' => 'admin@companio.test',
            'password' => 'password',
            'role' => 'admin',
        ]);

        $makeVolunteer = function (string $name, string $email, array $profile): User {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => 'password',
                'role' => 'volunteer',
            ]);
            VolunteerProfile::create(array_merge(['user_id' => $user->id], $profile));

            return $user;
        };

        $andrea = $makeVolunteer('Andrea Reyes', 'andrea@companio.test', [
            'housing_type' => 'apartment', 'yard' => 'none', 'has_cats' => true, 'has_dogs' => false,
            'kids' => 'none', 'hours_alone' => 8, 'experience' => 'some',
        ]);
        $paolo = $makeVolunteer('Paolo Garcia', 'paolo@companio.test', [
            'housing_type' => 'house', 'yard' => 'small', 'has_cats' => true, 'has_dogs' => false,
            'kids' => 'none', 'hours_alone' => 4, 'experience' => 'experienced',
        ]);
        $bea = $makeVolunteer('Bea Lim', 'bea@companio.test', [
            'housing_type' => 'apartment', 'yard' => 'none', 'has_cats' => false, 'has_dogs' => true,
            'kids' => 'young', 'hours_alone' => 8, 'experience' => 'first_time',
        ]);
        $carlo = $makeVolunteer('Carlo Dizon', 'carlo@companio.test', [
            'housing_type' => 'house', 'yard' => 'fenced', 'has_cats' => false, 'has_dogs' => false,
            'kids' => 'older', 'hours_alone' => 4, 'experience' => 'some',
        ]);
        $jessa = $makeVolunteer('Jessa Cruz', 'jessa@companio.test', [
            'housing_type' => 'townhouse', 'yard' => 'small', 'has_cats' => true, 'has_dogs' => false,
            'kids' => 'none', 'hours_alone' => 8, 'experience' => 'experienced',
        ]);
        $jun = $makeVolunteer('Jun Cruz', 'jun@companio.test', [
            'housing_type' => 'house', 'yard' => 'fenced', 'has_cats' => false, 'has_dogs' => true,
            'kids' => 'older', 'hours_alone' => 8, 'experience' => 'experienced',
        ]);
        $luis = $makeVolunteer('Luis Tan', 'luis@companio.test', [
            'housing_type' => 'house', 'yard' => 'small', 'has_cats' => false, 'has_dogs' => false,
            'kids' => 'none', 'hours_alone' => 12, 'experience' => 'some',
        ]);

        // ------------------------------------------------------------
        // Animals  (photo_url is left empty - add image links in the admin page)
        // ------------------------------------------------------------
        $defaults = [
            'apartment_ok' => true, 'needs_yard' => false, 'good_with_cats' => true, 'good_with_dogs' => true,
            'kids_ok' => 'any', 'max_hours_alone' => 8, 'is_urgent' => false, 'status' => 'Awaiting Foster',
        ];

        $rows = [
            ['name' => 'Kidlat', 'species' => 'dog', 'breed' => 'Aspin mix', 'sex' => 'Male', 'age' => '1 yr',
                'description' => 'Playful, house-trained and gentle with cats. He has lots of energy and needs daily walks and room to run.',
                'needs_yard' => true, 'kids_ok' => 'older', 'is_urgent' => true],
            ['name' => 'Luna', 'species' => 'cat', 'breed' => 'Puspin', 'sex' => 'Female', 'age' => '3 yrs',
                'description' => 'A calm lap cat who loves window spots. Used to living with other cats.',
                'good_with_dogs' => false, 'kids_ok' => 'older', 'is_urgent' => true, 'status' => 'Under Review'],
            ['name' => 'Mango', 'species' => 'dog', 'breed' => 'Shih tzu mix', 'sex' => 'Male', 'age' => '6 yrs',
                'description' => 'A relaxed senior who is happy with a couch and a short walk.',
                'kids_ok' => 'older', 'status' => 'Under Review'],
            ['name' => 'Biscuit', 'species' => 'cat', 'breed' => 'Puspin', 'sex' => 'Male', 'age' => '4 mos',
                'description' => 'A curious kitten. Needs feeding twice a day and lots of play.',
                'status' => 'Under Review'],
            ['name' => 'Tofu', 'species' => 'cat', 'breed' => 'Persian mix', 'sex' => 'Female', 'age' => '8 yrs',
                'description' => 'A quiet senior who prefers to be the only pet in a calm home.',
                'good_with_cats' => false, 'good_with_dogs' => false, 'kids_ok' => 'none', 'max_hours_alone' => 12],
            ['name' => 'Bantay', 'species' => 'dog', 'breed' => 'Aspin', 'sex' => 'Male', 'age' => '5 yrs',
                'description' => 'Loyal and alert. Needs a yard to patrol and does best as the only pet.',
                'needs_yard' => true, 'good_with_cats' => false, 'kids_ok' => 'older'],
            ['name' => 'Bruno', 'species' => 'dog', 'breed' => 'Labrador mix', 'sex' => 'Male', 'age' => '2 yrs',
                'description' => 'Friendly and sporty. Loves fetch and other dogs.',
                'apartment_ok' => false, 'needs_yard' => true, 'max_hours_alone' => 4, 'is_urgent' => true],
            ['name' => 'Mimi', 'species' => 'cat', 'breed' => 'Puspin', 'sex' => 'Female', 'age' => '2 yrs',
                'description' => 'Sweet and talkative. Gets along with everyone.',
                'max_hours_alone' => 12],
            ['name' => 'Ube', 'species' => 'cat', 'breed' => 'Siamese mix', 'sex' => 'Male', 'age' => '1 yr',
                'description' => 'An active climber who loves attention.',
                'good_with_dogs' => false, 'kids_ok' => 'older'],
            ['name' => 'Pepper', 'species' => 'dog', 'breed' => 'Aspin', 'sex' => 'Female', 'age' => '2 yrs',
                'description' => 'Smart and eager to learn.',
                'needs_yard' => true, 'status' => 'In Foster Care'],
            ['name' => 'Sisig', 'species' => 'cat', 'breed' => 'Puspin', 'sex' => 'Male', 'age' => '1 yr',
                'description' => 'Easygoing orange cat.',
                'status' => 'In Foster Care'],
            ['name' => 'Choco', 'species' => 'dog', 'breed' => 'Dachshund mix', 'sex' => 'Male', 'age' => '4 yrs',
                'description' => 'Adopted by his foster family.',
                'status' => 'Adopted'],
        ];

        $animals = [];
        foreach ($rows as $row) {
            $animals[$row['name']] = Animal::create(array_merge($defaults, $row));
        }

        // ------------------------------------------------------------
        // Foster requests + placements
        // ------------------------------------------------------------
        $apply = function (User $user, Animal $animal, string $status, ?string $message = null, int $daysAgo = 0) use ($matcher): FosterApplication {
            $score = $matcher->evaluate($animal, $user->volunteerProfile)['score'];

            $application = FosterApplication::create([
                'user_id' => $user->id,
                'animal_id' => $animal->id,
                'full_name' => $user->name,
                'phone' => '0917 555 01' . str_pad((string) $user->id, 2, '0', STR_PAD_LEFT),
                'address' => 'Quezon City, Metro Manila',
                'target_date' => now()->addDays(5)->toDateString(),
                'message' => $message,
                'match_score' => $score,
                'status' => $status,
            ]);

            // back-date the request so the dashboard "older than 2 days" number is meaningful
            $application->forceFill(['created_at' => now()->subDays($daysAgo)])->save();

            return $application;
        };

        // pending requests (Under Review animals)
        $apply($paolo, $animals['Mango'], 'Pending', 'We had a senior dog for 12 years. I am home most of the day.', 1);
        $apply($bea, $animals['Mango'], 'Pending', 'First time fostering but very excited!', 1);
        $apply($carlo, $animals['Biscuit'], 'Pending', 'I work from home and can feed twice a day.', 3);
        $apply($jessa, $animals['Luna'], 'Pending', 'My cat is calm and used to other cats.', 0);

        // active placements
        $pepperApp = $apply($jun, $animals['Pepper'], 'Approved', 'Experienced with active dogs.', 14);
        Placement::create([
            'foster_application_id' => $pepperApp->id, 'animal_id' => $animals['Pepper']->id,
            'foster_start_date' => now()->subDays(12)->toDateString(),
            'expected_return_date' => now()->addDays(2)->toDateString(),
            'notes' => 'Doing great on walks.', 'status' => 'Active',
        ]);

        $sisigApp = $apply($luis, $animals['Sisig'], 'Approved', null, 32);
        Placement::create([
            'foster_application_id' => $sisigApp->id, 'animal_id' => $animals['Sisig']->id,
            'foster_start_date' => now()->subDays(30)->toDateString(),
            'expected_return_date' => now()->addDays(14)->toDateString(),
            'status' => 'Active',
        ]);

        // adopted
        $chocoApp = $apply($luis, $animals['Choco'], 'Approved', null, 60);
        Placement::create([
            'foster_application_id' => $chocoApp->id, 'animal_id' => $animals['Choco']->id,
            'foster_start_date' => now()->subDays(50)->toDateString(),
            'expected_return_date' => now()->subDays(20)->toDateString(),
            'notes' => 'Foster family adopted him.', 'status' => 'Adopted',
        ]);
    }
}

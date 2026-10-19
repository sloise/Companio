<?php

namespace Tests\Feature;

use App\Models\Animal;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\MatchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnimalAndProfileFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function animalData(array $changes = []): array
    {
        return array_merge(['name' => 'New rescue', 'species' => 'dog', 'breed' => 'Mixed breed: Beagle', 'sex' => 'Female', 'birth_date' => '2025-02-18', 'health_status' => 'Vaccinated', 'sterilization_status' => 'Spayed', 'vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => '2026-02-18', 'next_due_at' => '2027-02-18'], ['type' => '5-in-1', 'vaccinated_at' => '2026-02-18', 'next_due_at' => null]], 'apartment_ok' => true, 'needs_yard' => false, 'good_with_cats' => true, 'good_with_dogs' => true, 'kids_ok' => 'any', 'max_hours_alone' => 4, 'care_rules_confirmed' => true, 'is_urgent' => false], $changes);
    }

    private function profileData(array $changes = []): array
    {
        return array_merge(['name' => 'Original Name', 'phone' => '09170000001', 'address' => '12 Main Street', 'birth_date' => '2000-01-01', 'emergency_name' => 'Emergency Person', 'emergency_phone' => '09170000002', 'housing_type' => 'house', 'yard' => 'fenced', 'has_cats' => false, 'has_dogs' => false, 'kids' => 'none', 'hours_alone' => 0, 'experience' => 'some'], $changes);
    }

    public function test_animal_dates_age_health_and_vaccines_round_trip(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 18)->startOfDay());
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $response = $this->postJson('/api/admin/animals', $this->animalData(['age' => 'FORGED']))->assertCreated()->assertJsonPath('animal.age', '1 year and 8 months')->assertJsonPath('animal.birth_date', '2025-02-18')->assertJsonPath('animal.vaccinations.1.type', '5-in-1');
        $id = $response->json('animal.id');
        $this->getJson('/api/admin/animals/'.$id)->assertOk()->assertJsonPath('sterilization_status', 'Spayed');
        $this->travelTo(now()->addMonths(2));
        $this->getJson('/api/admin/animals/'.$id)->assertOk()->assertJsonPath('age', '1 year and 10 months');
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['health_status' => 'Not Yet Vaccinated', 'vaccinations' => []]))->assertOk()->assertJsonPath('animal.vaccinations', []);
    }

    public function test_animal_validation_rejects_invalid_dates_species_vaccines_and_due_dates(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 18));
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        foreach ([['birth_date' => '2027-01-01'], ['health_status' => 'Unknown'], ['sterilization_status' => 'Invalid'], ['species' => 'cat'], ['vaccinations' => []], ['health_status' => 'Vaccination Due Soon'], ['vaccinations' => [['type' => 'Other', 'vaccinated_at' => '2026-02-18']]], ['vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => '2027-01-01']]], ['vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => '2026-02-18', 'next_due_at' => '2025-02-18']]], ['vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => '2024-01-01']]], ['health_status' => 'Records Unavailable']] as $changes) {
            $this->postJson('/api/admin/animals', $this->animalData($changes))->assertUnprocessable();
        }
        $this->postJson('/api/admin/animals', $this->animalData(['species' => 'cat', 'vaccinations' => [['type' => '3-in-1 (FVRCP)', 'vaccinated_at' => '2026-02-18'], ['type' => 'Other', 'other_name' => 'Veterinarian recorded vaccine', 'vaccinated_at' => '2026-02-18']]]))->assertCreated();
    }

    public function test_initial_name_is_canonical_then_profile_edits_can_change_it(): void
    {
        $user = User::factory()->create(['name' => 'Original Name']);
        Sanctum::actingAs($user);
        $this->putJson('/api/profile', $this->profileData(['name' => 'Injected Name', 'phone' => '+639170000001']))->assertOk()->assertJsonPath('user.name', 'Original Name')->assertJsonPath('profile.phone', '09170000001')->assertJsonPath('profile.hours_alone', 0);
        $this->travel(8)->days();
        $this->putJson('/api/profile', $this->profileData(['name' => 'Updated Full Name']))->assertOk()->assertJsonPath('user.name', 'Updated Full Name');
        $profile = $user->volunteerProfile()->firstOrFail();
        $animal = Animal::create($this->animalData() + ['age' => 'legacy', 'status' => 'Awaiting Foster']);
        $match = app(MatchService::class)->evaluate($animal, $profile);
        $this->assertSame(100, $match['score']);
    }

    public function test_phone_validation_and_normalized_emergency_contact_difference(): void
    {
        Sanctum::actingAs(User::factory()->create(['name' => 'Original Name']));
        foreach (['abc09170000001', '0917', '091700000011', '+6391700000012', '639170000001', '+109170000001', '0917 000 0001'] as $phone) {
            $this->putJson('/api/profile', $this->profileData(['phone' => $phone]))->assertUnprocessable()->assertJsonValidationErrors('phone');
            $this->putJson('/api/profile', $this->profileData(['emergency_phone' => $phone]))->assertUnprocessable()->assertJsonValidationErrors('emergency_phone');
        }
        $this->putJson('/api/profile', $this->profileData(['emergency_phone' => '+639170000001']))->assertUnprocessable()->assertJsonValidationErrors('emergency_phone');
        $this->putJson('/api/profile', $this->profileData(['emergency_phone' => '+639170000002']))->assertOk()->assertJsonPath('profile.emergency_phone', '09170000002');
    }

    public function test_staff_counts_notifications_and_recent_requests_are_role_scoped(): void
    {
        foreach (['admin', 'volunteer', 'staff_pending', 'staff_rejected', 'super_admin'] as $role) {
            $user = User::factory()->create(['role' => $role]);
            UserNotification::send($user->id, 'Private staff request', '/admin/staff-requests');
            UserNotification::send($user->id, 'Ordinary notification', '/profile');
            Sanctum::actingAs($user);
            $this->getJson('/api/notifications')->assertOk()->assertJsonPath('unread', $role === 'super_admin' ? 2 : 1)->assertJsonCount($role === 'super_admin' ? 2 : 1, 'notifications');
            if ($role === 'admin') {
                $this->getJson('/api/admin/counts')->assertOk()->assertJsonMissingPath('staff_requests');
            } elseif ($role === 'super_admin') {
                $this->getJson('/api/admin/counts')->assertOk()->assertJsonPath('staff_requests', 1);
            } else {
                $this->getJson('/api/admin/counts')->assertForbidden();
            }
            if ($role !== 'super_admin') {
                $this->getJson('/api/admin/staff-requests?recent=1')->assertForbidden();
            }
        }
        User::factory()->count(4)->create(['role' => 'staff_pending']);
        $this->getJson('/api/admin/staff-requests?recent=1')->assertOk()->assertJsonCount(3);
        $this->getJson('/api/admin/staff-requests')->assertOk()->assertJsonCount(7);
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $this->getJson('/api/admin/counts')->assertOk()->assertJsonMissingPath('staff_requests');
    }
}

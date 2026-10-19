<?php

namespace Tests\Feature;

use App\Models\Animal;
use App\Models\User;
use App\Models\VolunteerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OptionalAnimalFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function animalData(array $changes = []): array
    {
        return array_merge(['name' => 'Optional rescue', 'species' => 'dog', 'sex' => 'Female', 'birth_date' => null, 'health_status' => 'Records Unavailable', 'sterilization_status' => 'Unknown', 'vaccinations' => [], 'apartment_ok' => true, 'needs_yard' => false, 'good_with_cats' => true, 'good_with_dogs' => true, 'kids_ok' => 'any', 'max_hours_alone' => 4, 'care_rules_confirmed' => true, 'is_urgent' => false], $changes);
    }

    public function test_urgency_requires_structured_reason_and_deadline_and_logs_changes(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $data = $this->animalData(['is_urgent' => true, 'urgent_reason' => 'Medical care']);
        $this->postJson('/api/admin/animals', $data)->assertUnprocessable()->assertJsonValidationErrors('needed_by');
        $data['needed_by'] = today()->addDays(14)->toDateString();
        $this->postJson('/api/admin/animals', array_merge($data, ['urgent_reason' => 'Anything']))->assertUnprocessable()->assertJsonValidationErrors('urgent_reason');
        $id = $this->postJson('/api/admin/animals', $data)->assertCreated()->json('animal.id');
        $data['urgent_notes'] = 'Appointment arranged';
        $data['needed_by'] = today()->addDays(20)->toDateString();
        $this->putJson('/api/admin/animals/'.$id, $data)->assertOk();
        $this->assertDatabaseCount('animal_events', 3);
        $animal = Animal::findOrFail($id);
        $animal->update(['status' => 'In Foster Care']);
        $this->assertFalse($animal->fresh()->is_urgent);
        $this->assertNull($animal->fresh()->needed_by);
        $this->assertNull($animal->fresh()->urgent_notes);
        $this->assertDatabaseCount('animal_events', 4);
    }

    public function test_unknown_and_estimated_ages_round_trip_and_known_birth_date_wins(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 18)->startOfDay());
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $data = $this->animalData();
        unset($data['birth_date']);
        $id = $this->postJson('/api/admin/animals', $data)->assertCreated()->assertJsonPath('animal.age', 'Age Unknown')->assertJsonPath('animal.birth_date', null)->json('animal.id');
        $estimated = $this->animalData(['estimated_age_years' => 1, 'estimated_age_months' => 8]);
        $this->putJson('/api/admin/animals/'.$id, $estimated)->assertOk()->assertJsonPath('animal.age', '1 year and 8 months');
        $this->getJson('/api/admin/animals/'.$id)->assertOk()->assertJsonPath('estimated_age_years', 1)->assertJsonPath('estimated_age_months', 8);
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['estimated_age_months' => 8]))->assertOk()->assertJsonPath('animal.age', '8 months');
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['estimated_age_years' => 0]))->assertOk()->assertJsonPath('animal.age', '0 months');
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['birth_date' => '2025-02-18', 'estimated_age_years' => 5, 'estimated_age_months' => 2]))->assertOk()->assertJsonPath('animal.age', '1 year and 8 months')->assertJsonPath('animal.estimated_age_years', null)->assertJsonPath('animal.estimated_age_months', null);
        $this->putJson('/api/admin/animals/'.$id, $this->animalData())->assertOk()->assertJsonPath('animal.age', 'Age Unknown');
    }

    public function test_invalid_estimates_and_future_birth_dates_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        foreach ([['estimated_age_years' => -1], ['estimated_age_years' => 101], ['estimated_age_years' => 1.5], ['estimated_age_months' => 12], ['estimated_age_months' => 'unknown'], ['birth_date' => now()->addDay()->toDateString()]] as $changes) {
            $this->postJson('/api/admin/animals', $this->animalData($changes))->assertUnprocessable();
        }
    }

    public function test_sex_and_sterilization_status_must_match(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        foreach ([['Female', ['Spayed', 'Not Yet Spayed', 'Unknown']], ['Male', ['Neutered', 'Not Yet Neutered', 'Unknown']], [null, ['Unknown']]] as [$sex,$statuses]) {
            foreach ($statuses as $status) {
                $this->postJson('/api/admin/animals', $this->animalData(['name' => ($sex ?? 'Unknown').$status, 'sex' => $sex, 'sterilization_status' => $status]))->assertCreated();
            }
        }
        foreach ([['Female', 'Neutered'], ['Female', 'Not Yet Neutered'], ['Male', 'Spayed'], ['Male', 'Not Yet Spayed'], [null, 'Spayed']] as [$sex,$status]) {
            $this->postJson('/api/admin/animals', $this->animalData(['sex' => $sex, 'sterilization_status' => $status]))->assertUnprocessable()->assertJsonValidationErrors('sterilization_status');
        }
        $id = Animal::where('sterilization_status', 'Spayed')->firstOrFail()->id;
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['sex' => 'Male', 'sterilization_status' => 'Unknown']))->assertOk()->assertJsonPath('animal.sterilization_status', 'Unknown');
    }

    public function test_vaccine_dates_can_be_missing_with_or_without_known_birth_date(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 18));
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $data = $this->animalData(['health_status' => 'Vaccinated', 'vaccinations' => [['type' => 'Anti-Rabies']]]);
        $id = $this->postJson('/api/admin/animals', $data)->assertCreated()->assertJsonPath('animal.vaccinations.0.vaccinated_at', null)->assertJsonPath('animal.health_status', 'Vaccinated')->json('animal.id');
        $this->putJson('/api/admin/animals/'.$id, array_merge($data, ['birth_date' => '2025-02-18']))->assertOk()->assertJsonPath('animal.vaccinations.0.vaccinated_at', null);
        $due = $this->animalData(['health_status' => 'Vaccination Due Soon', 'vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => null, 'next_due_at' => '2026-11-18']]]);
        $this->putJson('/api/admin/animals/'.$id, $due)->assertOk()->assertJsonPath('animal.vaccinations.0.next_due_at', '2026-11-18');
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['health_status' => 'Vaccinated', 'vaccinations' => [['type' => 'Anti-Rabies', 'vaccinated_at' => '2026-01-01', 'next_due_at' => '2025-01-01']]]))->assertUnprocessable();
        $this->putJson('/api/admin/animals/'.$id, $this->animalData(['health_status' => 'Records Unavailable', 'vaccinations' => [['type' => 'Anti-Rabies']]]))->assertUnprocessable();
        $this->getJson('/api/admin/animals/'.$id)->assertOk()->assertJsonPath('health_status', 'Vaccination Due Soon');
    }

    public function test_screening_findings_can_be_none_missing_or_comments_with_authorization(): void
    {
        $user = User::factory()->create();
        $profile = VolunteerProfile::create(['user_id' => $user->id, 'phone' => '09170000001', 'address' => '12 Main Street', 'birth_date' => '2000-01-01', 'emergency_name' => 'Caretaker', 'emergency_phone' => '09170000002', 'housing_type' => 'house', 'yard' => 'fenced', 'has_cats' => false, 'has_dogs' => false, 'kids' => 'none', 'hours_alone' => 0, 'experience' => 'some']);
        $endpoint = '/api/admin/profiles/'.$profile->id.'/review';
        $data = ['review_status' => 'Approved', 'reviewed_version' => $profile->updated_at->toISOString(), 'findings_type' => 'none'];
        Sanctum::actingAs($user);
        $this->patchJson($endpoint, $data)->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->patchJson($endpoint, $data + ['review_notes' => 'Must be discarded for None'])->assertOk();
        $this->assertNull($profile->fresh()->review_notes);
        foreach ([[], ['findings_type' => 'comments'], ['findings_type' => 'comments', 'review_notes' => 'Safe household.']] as $findings) {
            $profile->refresh()->update(['review_status' => 'Pending']);
            $payload = ['review_status' => 'Approved', 'reviewed_version' => $profile->fresh()->updated_at->toISOString()] + $findings;
            $this->patchJson($endpoint,$payload)->assertOk();
            $this->assertSame($findings['review_notes'] ?? null,$profile->fresh()->review_notes);
        }
    }
}

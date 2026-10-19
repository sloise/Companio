<?php

namespace Tests\Feature;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\User;
use App\Models\VolunteerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SafetyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['privacy.controller' => 'Test Shelter', 'privacy.contact' => 'privacy@example.test', 'privacy.retention' => 'Test policy: delete 30 days after closure.']);
    }

    private function volunteer(int $age = 25): User
    {
        $user = User::factory()->create(['role' => 'volunteer']);
        VolunteerProfile::create(array_merge($this->profileData(), [
            'user_id' => $user->id, 'birth_date' => now()->subYears($age)->toDateString(),
            'review_status' => 'Approved', 'last_edited_at' => now()->subDays(8),
        ]));

        return $user;
    }

    private function profileData(): array
    {
        return ['name' => 'Alex Foster', 'phone' => '09170000001', 'address' => '12 Shelter Street',
            'birth_date' => '2000-01-01', 'emergency_name' => 'Sam Caretaker', 'emergency_phone' => '09170000002',
            'housing_type' => 'house', 'yard' => 'fenced', 'has_cats' => false, 'has_dogs' => false,
            'kids' => 'none', 'hours_alone' => 4, 'experience' => 'experienced'];
    }

    private function animal(array $changes = []): Animal
    {
        return Animal::create(array_merge(['name' => 'Rescue', 'species' => 'dog', 'age' => '2 years',
            'apartment_ok' => true, 'needs_yard' => false, 'good_with_cats' => true, 'good_with_dogs' => true,
            'kids_ok' => 'any', 'max_hours_alone' => 8, 'is_urgent' => false, 'status' => 'Awaiting Foster'], $changes));
    }

    private function payload(Animal $animal): array
    {
        return ['animal_id' => $animal->id, 'full_name' => 'Forged name', 'phone' => 'Forged phone', 'address' => 'Forged address',
            'target_date' => now()->addDays(4)->toDateString(), 'agreed' => true, 'privacy_consent' => true, 'privacy_notice_version' => config('privacy.version'),
            'government_id' => UploadedFile::fake()->create('id.pdf', 10, 'application/pdf'),
            'home_photos' => [UploadedFile::fake()->image('sleeping.jpg'), UploadedFile::fake()->image('living.jpg')],
            'interview_type' => 'interview', 'interview_at' => now()->addDays(2)->toIso8601String()];
    }

    private function admin(): User
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function application(User $user, Animal $animal, array $changes = []): FosterApplication
    {
        return FosterApplication::create(array_merge(['user_id' => $user->id, 'animal_id' => $animal->id,
            'full_name' => $user->name, 'phone' => '09170000001', 'address' => '12 Shelter Street',
            'target_date' => now()->addDays(4), 'match_score' => 100, 'status' => 'Pending'], $changes));
    }

    public function test_new_pet_defaults_to_awaiting_foster_even_if_status_is_forged(): void
    {
        $this->admin();
        $data = $this->animal()->toArray();
        unset($data['id'], $data['created_at'], $data['updated_at']);
        $data['name'] = 'New rescue';
        $data['status'] = 'Adopted';
        $data['birth_date'] = '2024-01-01';
        $data['health_status'] = 'Records Unavailable';
        $data['sterilization_status'] = 'Unknown';
        $data['care_rules_confirmed'] = true;
        $this->postJson('/api/admin/animals', $data)->assertCreated()->assertJsonPath('animal.status', 'Awaiting Foster');
    }

    public function test_animal_requires_every_rule_and_confirmation(): void
    {
        $this->admin();
        $this->postJson('/api/admin/animals', ['name' => 'Incomplete', 'species' => 'dog', 'age' => '2'])->assertUnprocessable()->assertJsonValidationErrors(['apartment_ok', 'needs_yard', 'good_with_cats', 'good_with_dogs', 'kids_ok', 'max_hours_alone', 'care_rules_confirmed']);
    }

    public function test_privacy_consent_is_required_versioned_and_recorded(): void
    {
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $animal = $this->animal();
        $payload = $this->payload($animal);
        unset($payload['privacy_consent']);
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('privacy_consent');
        $payload['privacy_consent'] = true;
        $payload['privacy_notice_version'] = 'outdated';
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('privacy_notice_version');
        $payload['privacy_notice_version'] = config('privacy.version');
        $response = $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertCreated();
        $consent = FosterApplication::findOrFail($response->json('application.id'))->screening['privacy_consent'];
        $this->assertNotEmpty($consent['accepted_at']);
        $this->assertSame(config('privacy.version'), $consent['notice_version']);
        $this->assertSame('Test Shelter', $consent['notice']['controller']);
    }

    public function test_missing_privacy_policy_blocks_application(): void
    {
        Sanctum::actingAs($this->volunteer());
        config(['privacy.retention' => null]);
        $this->getJson('/api/privacy-notice')->assertOk()->assertJsonPath('ready', false);
        $this->post('/api/applications', $this->payload($this->animal()), ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_urgent_requires_a_reason(): void
    {
        $this->admin();
        $data = $this->animal()->toArray();
        $data['care_rules_confirmed'] = true;
        $data['is_urgent'] = true;
        $this->postJson('/api/admin/animals', $data)->assertUnprocessable()->assertJsonValidationErrors('urgent_reason');
    }

    public function test_profile_change_requires_screening_and_enforces_cooldown(): void
    {
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $this->putJson('/api/profile', array_merge($this->profileData(), ['housing_type' => 'apartment']))->assertOk()->assertJsonPath('profile.review_status', 'Pending');
        $this->putJson('/api/profile', $this->profileData())->assertStatus(429);
        $this->assertDatabaseHas('volunteer_profiles', ['user_id' => $user->id, 'housing_type' => 'apartment', 'review_status' => 'Pending']);
    }

    public function test_profile_review_requires_admin_and_a_current_version(): void
    {
        $user = $this->volunteer();
        $profile = $user->volunteerProfile;
        $profile->update(['review_status' => 'Pending']);
        Sanctum::actingAs($user);
        $this->getJson('/api/admin/profiles/pending')->assertForbidden();
        $this->admin();
        $this->patchJson('/api/admin/profiles/'.$profile->id.'/review', ['review_status' => 'Approved', 'review_notes' => 'Contact and home checked', 'reviewed_version' => now()->subDays(1)->toIso8601String()])->assertStatus(409);
        $this->patchJson('/api/admin/profiles/'.$profile->id.'/review', ['review_status' => 'Approved', 'review_notes' => 'Contact and home checked', 'reviewed_version' => $profile->fresh()->updated_at->toIso8601String()])->assertOk();
    }

    public function test_unscreened_profile_cannot_submit(): void
    {
        $user = $this->volunteer();
        $user->volunteerProfile->update(['review_status' => 'Pending']);
        Sanctum::actingAs($user);
        $this->postJson('/api/applications', ['animal_id' => $this->animal()->id])->assertUnprocessable();
    }

    public function test_documents_and_appointment_are_mandatory(): void
    {
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $this->postJson('/api/applications', ['animal_id' => $this->animal()->id])->assertUnprocessable()->assertJsonValidationErrors(['government_id', 'home_photos', 'interview_at']);
    }

    public function test_below_60_is_blocked_and_60_is_eligible_with_unmatched_rules(): void
    {
        Storage::fake('local');
        $user = $this->volunteer();
        $user->volunteerProfile->update(['housing_type' => 'apartment', 'yard' => 'none', 'hours_alone' => 12]);
        Sanctum::actingAs($user);
        $animal = $this->animal(['apartment_ok' => false, 'needs_yard' => true, 'max_hours_alone' => 4]);
        $this->post('/api/applications', $this->payload($animal), ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('foster_applications', 0);
        $this->assertCount(0, Storage::disk('local')->allFiles());
        $user->volunteerProfile->update(['hours_alone' => 4]);
        $user->unsetRelation('volunteerProfile');
        $this->getJson('/api/matches/'.$animal->id)->assertOk()->assertJsonPath('match.score', 60)->assertJsonPath('match.eligible', true);
        $this->post('/api/applications', $this->payload($animal), ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('application.match_score', 60);
    }

    public function test_saved_details_are_reused_and_documents_stay_private(): void
    {
        Storage::fake('local');
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $response = $this->post('/api/applications', $this->payload($this->animal()), ['Accept' => 'application/json'])->assertCreated();
        $response->assertJsonPath('application.full_name', $user->name)->assertJsonPath('application.phone', '09170000001')->assertJsonMissingPath('application.documents');
        $app = FosterApplication::firstOrFail();
        $this->assertCount(3, $app->documents);
        $this->getJson('/api/admin/applications/'.$app->id.'/documents/government_id')->assertForbidden();
        $this->admin();
        $this->get('/api/admin/applications/'.$app->id.'/documents/government_id')->assertOk();
    }

    public function test_minor_requires_adult_cosigner_and_consent(): void
    {
        Storage::fake('local');
        $user = $this->volunteer(16);
        Sanctum::actingAs($user);
        $payload = $this->payload($this->animal());
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors(['cosigner_name', 'cosigner_id', 'cosigner_consent']);
        $payload = array_merge($payload, ['cosigner_name' => 'Adult Guardian', 'cosigner_phone' => '09170000003', 'cosigner_birth_date' => now()->subYears(17)->toDateString(), 'cosigner_relationship' => 'Parent', 'cosigner_consent' => true, 'cosigner_id' => UploadedFile::fake()->create('guardian.pdf', 10, 'application/pdf')]);
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('cosigner_birth_date');
        $payload['cosigner_birth_date'] = now()->subYears(40)->toDateString();
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('application.screening.requires_cosigner', true);
    }

    public function test_adoption_requires_formal_request_and_return_remains_available(): void
    {
        $user = $this->volunteer();
        $animal = $this->animal(['status' => 'In Foster Care']);
        $app = $this->application($user, $animal);
        $placement = Placement::create(['foster_application_id' => $app->id, 'animal_id' => $animal->id, 'foster_start_date' => now(), 'status' => 'Active']);
        $this->admin();
        $this->patchJson('/api/admin/placements/'.$placement->id, ['status' => 'Adopted'])->assertUnprocessable();
        $this->patchJson('/api/admin/placements/'.$placement->id, ['status' => 'Returned'])->assertOk();
        $this->assertEquals('Awaiting Foster', $animal->fresh()->status);
        $this->patchJson('/api/admin/placements/'.$placement->id, ['status' => 'Active'])->assertUnprocessable();
    }

    public function test_formal_adoption_can_be_confirmed(): void
    {
        $user = $this->volunteer();
        $animal = $this->animal(['status' => 'In Foster Care']);
        $app = $this->application($user, $animal);
        $placement = Placement::create(['foster_application_id' => $app->id, 'animal_id' => $animal->id, 'foster_start_date' => now(), 'status' => 'Active', 'foster_request' => 'adopt']);
        $this->admin();
        $this->patchJson('/api/admin/placements/'.$placement->id, ['status' => 'Adopted'])->assertOk();
        $this->assertEquals('Adopted', $animal->fresh()->status);
    }

    public function test_approval_requires_verification_and_rechecks_current_home(): void
    {
        $user = $this->volunteer();
        $animal = $this->animal();
        $app = $this->application($user, $animal);
        $this->admin();
        $this->patchJson('/api/admin/applications/'.$app->id, ['status' => 'Approved'])->assertUnprocessable();
        $this->assertDatabaseCount('placements', 0);
    }

    public function test_verified_60_percent_application_can_be_approved_after_interview(): void
    {
        Storage::fake('local');
        foreach (['screening/id.pdf', 'screening/a.jpg', 'screening/b.jpg'] as $path) {
            Storage::disk('local')->put($path, 'test document');
        }
        $user = $this->volunteer();
        $user->volunteerProfile->update(['housing_type' => 'apartment', 'yard' => 'none']);
        $animal = $this->animal(['apartment_ok' => false, 'needs_yard' => true]);
        $app = $this->application($user, $animal, ['match_score' => 60, 'documents' => ['government_id' => 'screening/id.pdf', 'home_1' => 'screening/a.jpg', 'home_2' => 'screening/b.jpg'],
            'profile_snapshot' => $user->volunteerProfile->toArray(), 'screening' => ['interview_at' => now()->subHour()->toIso8601String(), 'requires_cosigner' => false, 'appointment_status' => 'Confirmed']]);
        $this->admin();
        $this->patchJson('/api/admin/applications/'.$app->id.'/verify', ['identity_checked' => true, 'home_checked' => true, 'caretaker_checked' => true, 'interview_completed' => true])->assertOk();
        $this->patchJson('/api/admin/applications/'.$app->id, ['status' => 'Approved'])->assertOk();
        $this->assertDatabaseHas('placements', ['foster_application_id' => $app->id, 'status' => 'Active']);
    }

    public function test_future_interview_and_changed_profile_cannot_be_verified(): void
    {
        Storage::fake('local');
        foreach (['id.pdf', 'a.jpg', 'b.jpg'] as $path) {
            Storage::disk('local')->put($path, 'test document');
        }
        $user = $this->volunteer();
        $animal = $this->animal();
        $app = $this->application($user, $animal, ['documents' => ['government_id' => 'id.pdf', 'home_1' => 'a.jpg', 'home_2' => 'b.jpg'], 'profile_snapshot' => $user->volunteerProfile->toArray(), 'screening' => ['interview_at' => now()->addDay()->toIso8601String(), 'appointment_status' => 'Confirmed']]);
        $checks = ['identity_checked' => true, 'home_checked' => true, 'caretaker_checked' => true, 'interview_completed' => true];
        $this->admin();
        $this->patchJson('/api/admin/applications/'.$app->id.'/verify', $checks)->assertUnprocessable();
        $user->volunteerProfile->update(['last_edited_at' => now()]);
        $app->update(['screening' => ['interview_at' => now()->subHour()->toIso8601String()]]);
        $this->patchJson('/api/admin/applications/'.$app->id.'/verify', $checks)->assertUnprocessable();
    }

    public function test_urgency_does_not_change_score_and_all_rules_are_returned(): void
    {
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $animal = $this->animal(['is_urgent' => true, 'urgent_reason' => 'Shelter capacity']);
        $this->getJson('/api/matches/'.$animal->id)->assertOk()->assertJsonPath('match.score', 100)->assertJsonCount(5, 'match.checks');
        $animal->update(['is_urgent' => false]);
        $this->getJson('/api/matches/'.$animal->id)->assertOk()->assertJsonPath('match.score', 100)->assertJsonPath('match.eligible', true);
    }

    public function test_profile_change_invalidates_previous_application_verification(): void
    {
        $user = $this->volunteer();
        $app = $this->application($user, $this->animal(), ['verification_completed_at' => now(), 'verified_by' => $this->admin()->id]);
        Sanctum::actingAs($user);
        $this->putJson('/api/profile', $this->profileData())->assertOk();
        $this->assertNull($app->fresh()->verification_completed_at);
    }

    public function test_uploads_reject_executable_files_and_too_few_home_photos(): void
    {
        Storage::fake('local');
        $user = $this->volunteer();
        Sanctum::actingAs($user);
        $payload = $this->payload($this->animal());
        $payload['government_id'] = UploadedFile::fake()->create('script.php', 1, 'text/x-php');
        $payload['home_photos'] = [];
        $this->post('/api/applications', $payload, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors(['government_id', 'home_photos']);
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    public function test_admin_can_confirm_appointment_and_notify_volunteer(): void
    {
        $user = $this->volunteer();
        $app = $this->application($user, $this->animal(), ['screening' => ['interview_at' => now()->addDay()->toIso8601String(), 'appointment_status' => 'Requested']]);
        $this->admin();
        $this->patchJson('/api/admin/applications/'.$app->id.'/schedule', ['interview_type' => 'shelter_visit', 'interview_at' => now()->addDays(2)->toIso8601String()])->assertOk();
        $this->assertEquals('Confirmed', $app->fresh()->screening['appointment_status']);
        $this->assertDatabaseHas('user_notifications', ['user_id' => $user->id, 'link' => '/applications']);
        $this->patchJson('/api/admin/applications/'.$app->id.'/schedule', ['interview_type' => 'interview', 'interview_at' => now()->addDays(10)->toIso8601String()])->assertUnprocessable();
    }

    public function test_80_percent_is_eligible_despite_an_unmatched_care_rule(): void
    {
        Storage::fake('local');
        $user = $this->volunteer();
        $user->volunteerProfile->update(['housing_type' => 'apartment']);
        Sanctum::actingAs($user);
        $animal = $this->animal(['apartment_ok' => false]);
        $this->getJson('/api/matches/'.$animal->id)->assertOk()->assertJsonPath('match.score', 80)->assertJsonPath('match.eligible', true);
        $this->post('/api/applications', $this->payload($animal), ['Accept' => 'application/json'])->assertCreated();
    }

    public function test_profile_picture_upload_replace_and_remove_preserve_screening_and_cooldown(): void
    {
        $user = $this->volunteer();
        $profile = $user->volunteerProfile;
        $profile->update(['last_edited_at' => now()]);
        $original = $profile->fresh()->toArray();
        $other = User::factory()->create();
        Sanctum::actingAs($user);
        $response = $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->image('portrait.png', 600, 400), 'user_id' => $other->id], ['Accept' => 'application/json'])->assertOk();
        $this->assertStringStartsWith('data:image/jpeg;base64,', $response->json('user.photo_url'));
        $bytes = base64_decode(explode(',', $response->json('user.photo_url'), 2)[1]);
        $info = getimagesizefromstring($bytes);
        $this->assertEquals([320, 320], [$info[0], $info[1]]);
        $this->assertNull($other->fresh()->photo_url);
        $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->image('replacement.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->assertEquals($original, $profile->fresh()->toArray());
        $this->deleteJson('/api/profile/photo')->assertOk()->assertJsonPath('user.photo_url', null);
        $this->assertNull($user->fresh()->photo_url);
    }

    public function test_profile_picture_rejects_invalid_and_oversized_files_and_requires_login(): void
    {
        $this->postJson('/api/profile/photo')->assertUnauthorized();
        Sanctum::actingAs($this->volunteer());
        $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->create('script.php', 1, 'text/x-php')], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('photo');
        $this->post('/api/profile/photo', ['photo' => UploadedFile::fake()->image('large.jpg')->size(4097)], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('photo');
    }
}

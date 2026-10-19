<?php

namespace Tests\Feature;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\User;
use App\Models\VolunteerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ImportantActionAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function animal(): Animal
    {
        return Animal::create(['name' => 'Rescue', 'species' => 'dog', 'age' => 'Age Unknown', 'apartment_ok' => true, 'needs_yard' => false, 'good_with_cats' => true, 'good_with_dogs' => true, 'kids_ok' => 'any', 'max_hours_alone' => 4, 'is_urgent' => false, 'status' => 'Awaiting Foster']);
    }

    private function application(User $user, Animal $animal): FosterApplication
    {
        return FosterApplication::create(['user_id' => $user->id, 'animal_id' => $animal->id, 'full_name' => $user->name, 'phone' => '09170000001', 'address' => '12 Main St', 'target_date' => now()->addDays(4), 'match_score' => 100, 'status' => 'Pending']);
    }

    public function test_important_admin_actions_require_authentication_and_admin_authorization(): void
    {
        $owner = User::factory()->create();
        $animal = $this->animal();
        $app = $this->application($owner, $animal);
        $profile = VolunteerProfile::create(['user_id' => $owner->id, 'housing_type' => 'house', 'yard' => 'fenced', 'kids' => 'none', 'hours_alone' => 0, 'experience' => 'some']);
        $placement = Placement::create(['animal_id' => $animal->id, 'foster_application_id' => $app->id, 'foster_start_date' => today(), 'status' => 'Active']);
        $routes = [['post', '/api/admin/animals', []], ['put', '/api/admin/animals/'.$animal->id, []], ['delete', '/api/admin/animals/'.$animal->id, []], ['patch', '/api/admin/applications/'.$app->id, ['status' => 'Rejected', 'staff_notes' => 'Reason']], ['patch', '/api/admin/applications/'.$app->id.'/reopen', []], ['patch', '/api/admin/applications/'.$app->id.'/schedule', []], ['patch', '/api/admin/applications/'.$app->id.'/verify', []], ['patch', '/api/admin/profiles/'.$profile->id.'/review', []], ['patch', '/api/admin/placements/'.$placement->id, []], ['delete', '/api/admin/placements/'.$placement->id.'/request', []]];
        foreach ($routes as [$method,$url,$data]) {
            $this->{$method.'Json'}($url, $data)->assertUnauthorized();
        }
        foreach (['volunteer', 'staff_pending', 'staff_rejected'] as $role) {
            Sanctum::actingAs(User::factory()->create(['role' => $role]));
            foreach ($routes as [$method,$url,$data]) {
                $this->{$method.'Json'}($url, $data)->assertForbidden();
            }
        }
        $this->assertDatabaseHas('animals', ['id' => $animal->id, 'status' => 'Awaiting Foster']);
        $this->assertDatabaseHas('foster_applications', ['id' => $app->id, 'status' => 'Pending']);
    }

    public function test_rejection_reason_is_validated_and_repeated_decisions_do_not_repeat_side_effects(): void
    {
        $owner = User::factory()->create();
        $app = $this->application($owner, $this->animal());
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $url = '/api/admin/applications/'.$app->id;
        $this->patchJson($url, ['status' => 'Rejected'])->assertUnprocessable()->assertJsonValidationErrors('staff_notes');
        $this->patchJson($url, ['status' => 'Rejected', 'staff_notes' => str_repeat('x', 501)])->assertUnprocessable();
        $this->assertSame('Pending', $app->fresh()->status);
        $this->patchJson($url, ['status' => 'Rejected', 'staff_notes' => 'The home cannot meet this rescue?s care needs.'])->assertOk();
        $this->assertSame('Rejected', $app->fresh()->status);
        $this->patchJson($url, ['status' => 'Rejected', 'staff_notes' => 'Duplicate'])->assertUnprocessable();
        $this->assertSame(1, $owner->appNotifications()->count());
    }

    public function test_volunteers_cannot_modify_other_users_applications_or_placements_and_requests_cannot_be_overwritten(): void
    {
        $owner = User::factory()->create();
        $app = $this->application($owner, $this->animal());
        $placement = Placement::create(['animal_id' => $app->animal_id, 'foster_application_id' => $app->id, 'foster_start_date' => today(), 'status' => 'Active']);
        Sanctum::actingAs(User::factory()->create());
        $this->patchJson('/api/my-applications/'.$app->id.'/withdraw')->assertForbidden();
        $this->patchJson('/api/my-placements/'.$placement->id.'/request', ['type' => 'adopt'])->assertForbidden();
        $this->deleteJson('/api/my-placements/'.$placement->id.'/request')->assertForbidden();
        Sanctum::actingAs($owner);
        $this->patchJson('/api/my-placements/'.$placement->id.'/request', ['type' => 'adopt'])->assertOk();
        $this->patchJson('/api/my-placements/'.$placement->id.'/request', ['type' => 'return'])->assertStatus(409);
        $this->assertSame('adopt', $placement->fresh()->foster_request);
        $this->deleteJson('/api/my-placements/'.$placement->id.'/request')->assertOk();
        $this->patchJson('/api/my-placements/'.$placement->id.'/request', ['type' => 'return'])->assertOk();
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ShelterApprovalTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $changes = []): array
    {
        return array_merge(['name' => 'Shelter Applicant', 'email' => 'new@example.test', 'password' => 'password123', 'account_type' => 'shelter', 'shelter_id' => UploadedFile::fake()->create('id.pdf', 10, 'application/pdf')], $changes);
    }

    public function test_shelter_registration_is_pending_and_private(): void
    {
        Storage::fake('local');
        $this->postJson('/api/register', $this->payload())->assertCreated()->assertJsonPath('pending', true)->assertJsonMissingPath('token');
        $user = User::where('email', 'new@example.test')->firstOrFail();
        $this->assertSame('staff_pending', $user->role);
        Storage::disk('local')->assertExists($user->shelter_id_path);
        $this->assertArrayNotHasKey('shelter_id_path', $user->toArray());
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password123'])->assertUnprocessable();
        Sanctum::actingAs($user);
        $this->getJson('/api/admin/dashboard')->assertForbidden();
        $this->getJson('/api/admin/staff-requests/'.$user->id.'/id')->assertForbidden();
    }

    public function test_uploads_and_privilege_injection_are_validated(): void
    {
        Storage::fake('local');
        foreach ([['shelter_id' => null], ['shelter_id' => UploadedFile::fake()->create('id.exe', 10, 'application/octet-stream')], ['shelter_id' => UploadedFile::fake()->create('id.pdf', 4097, 'application/pdf')], ['role' => 'super_admin'], ['approval_status' => 'Approved']] as $changes) {
            $this->postJson('/api/register', $this->payload($changes))->assertUnprocessable();
        }
        $this->assertDatabaseCount('users', 0);
    }

    public function test_duplicate_email_is_blocked_and_shelter_fields_are_not_required(): void
    {
        Storage::fake('local');
        $this->postJson('/api/register', $this->payload())->assertCreated();
        $this->postJson('/api/register', $this->payload(['email' => ' NEW@EXAMPLE.TEST ']))->assertUnprocessable();
        $this->postJson('/api/register', $this->payload(['email' => 'second@example.test', 'shelter_name' => ' SAFE  HOME ', 'shelter_address' => '12 MAIN ST']))->assertCreated();
        Sanctum::actingAs(User::factory()->create(['role' => 'super_admin']));
        $rows = $this->getJson('/api/admin/staff-requests')->assertOk()->json();
        $this->assertCount(0, $rows[0]['duplicates']);
        $this->assertSame('staff_pending', $rows[0]['role']);
    }

    public function test_only_super_admin_can_review_or_download_and_decisions_are_final(): void
    {
        Storage::fake('local');
        $this->postJson('/api/register', $this->payload())->assertCreated();
        $user = User::where('email', 'new@example.test')->firstOrFail();
        $url = '/api/admin/staff-requests/'.$user->id;
        $this->getJson($url.'/id')->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/admin/staff-requests')->assertForbidden();
        $this->patchJson($url)->assertForbidden();
        $this->deleteJson($url, ['rejection_reason' => 'No'])->assertForbidden();
        $this->getJson($url.'/id')->assertForbidden();
        $super = User::factory()->create(['role' => 'super_admin']);
        Sanctum::actingAs($super);
        $idResponse=$this->getJson($url.'/id')->assertOk();
        $this->assertStringStartsWith('inline;', $idResponse->headers->get('Content-Disposition'));
        $this->assertStringContainsString('no-store', $idResponse->headers->get('Cache-Control'));
        $this->assertSame('nosniff',$idResponse->headers->get('X-Content-Type-Options'));
        $this->patchJson($url)->assertOk();
        $this->assertSame('admin', $user->fresh()->role);
        $this->assertSame($super->id, $user->fresh()->staff_reviewed_by);
        $this->deleteJson($url, ['rejection_reason' => 'No'])->assertStatus(409);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password123'])->assertOk()->assertJsonPath('user.role', 'admin');
    }

    public function test_rejection_is_retained_and_blocks_login(): void
    {
        Storage::fake('local');
        $this->postJson('/api/register', $this->payload())->assertCreated();
        $user = User::where('email', 'new@example.test')->firstOrFail();
        Sanctum::actingAs(User::factory()->create(['role' => 'super_admin']));
        $url = '/api/admin/staff-requests/'.$user->id;
        $this->deleteJson($url)->assertUnprocessable();
        $this->deleteJson($url, ['rejection_reason' => 'Identity could not be verified.'])->assertOk();
        $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'staff_rejected', 'rejection_reason' => 'Identity could not be verified.']);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password123'])->assertUnprocessable();
        $user->createToken('old-session');
        DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => 'old-reset', 'created_at' => now()]);
        $path = $user->shelter_id_path;
        $this->postJson('/api/register', $this->payload())->assertCreated()->assertJsonPath('pending', true);
        $this->assertSame('new@example.test', $user->fresh()->archived_email);
        $this->assertSame($path, $user->fresh()->shelter_id_path);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'new@example.test']);
        $this->assertSame('Identity could not be verified.', $user->fresh()->rejection_reason);
        Storage::disk('local')->assertExists($path);
        $this->assertSame(1, User::where('email', 'new@example.test')->count());
        $this->postJson('/api/register', $this->payload())->assertUnprocessable();
        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/admin/dashboard')->assertForbidden();
    }

    public function test_volunteer_registration_still_logs_in_without_id(): void
    {
        $this->postJson('/api/register', ['name' => 'Foster User', 'email' => 'foster@example.test', 'password' => 'password123', 'account_type' => 'volunteer'])->assertCreated()->assertJsonPath('user.role', 'volunteer')->assertJsonStructure(['token']);
    }
}

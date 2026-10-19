<?php
namespace Tests\Feature;
use App\Models\{Animal,Conversation,FosterApplication,Placement,User,UserNotification};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
class CommunicationTest extends TestCase {
 use RefreshDatabase;
 private function setupChat(): array {
  $f=User::factory()->create(['role'=>'volunteer']);$s=User::factory()->create(['role'=>'admin']);$s->forceFill(['shelter_key'=>str_repeat('a',64)])->save();
  $a=Animal::create(['name'=>'Milo','species'=>'dog','age'=>'Unknown','apartment_ok'=>true,'needs_yard'=>false,'good_with_cats'=>true,'good_with_dogs'=>true,'kids_ok'=>'any','max_hours_alone'=>4,'is_urgent'=>false,'status'=>'In Foster Care']);
  $app=FosterApplication::create(['user_id'=>$f->id,'animal_id'=>$a->id,'full_name'=>$f->name,'phone'=>'09170000001','address'=>'Home','target_date'=>today(),'match_score'=>100,'status'=>'Approved','decided_by'=>$s->id]);
  $p=Placement::create(['animal_id'=>$a->id,'foster_application_id'=>$app->id,'foster_start_date'=>today(),'status'=>'Active']);
  Sanctum::actingAs($s);$id=$this->postJson('/api/placements/'.$p->id.'/conversation')->assertOk()->json('id');Sanctum::actingAs($f);return [$f,$s,$a,$p,$id];
 }
 public function test_exchange_counts_read_receipts_notifications_and_persistence():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  $m=$this->postJson("/api/conversations/$id/messages",['body'=>'Eating well','category'=>'feeding'])->assertCreated()->json('id');
  $this->assertDatabaseHas('messages',['id'=>$m,'conversation_id'=>$id,'category'=>'feeding']);
  $this->assertDatabaseHas('user_notifications',['user_id'=>$s->id,'link'=>"/admin/messages/$id"]);
  Sanctum::actingAs($s);$this->getJson('/api/conversations')->assertJsonPath('unread',1)->assertJsonPath('conversations.0.pet.id',$a->id);
  $this->getJson("/api/conversations/$id")->assertOk()->assertJsonPath('messages.0.body','Eating well');
  $this->postJson("/api/conversations/$id/read",['message_id'=>$m])->assertOk();$this->getJson('/api/conversations')->assertJsonPath('unread',0);
  $this->postJson("/api/conversations/$id/messages",['body'=>'Thank you','category'=>'message'])->assertCreated();
  Sanctum::actingAs($f);$this->getJson("/api/conversations/$id")->assertJsonCount(2,'messages');$this->getJson('/api/conversations')->assertJsonPath('unread',1);
  $n=UserNotification::where('user_id',$f->id)->first();$this->postJson('/api/notifications/'.$n->id.'/read')->assertOk();$this->assertNotNull($n->fresh()->read_at);
 }
 public function test_outsiders_super_admin_and_revoked_staff_cannot_access_chat():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  foreach(['volunteer','admin','super_admin','staff_pending'] as $role){
   Sanctum::actingAs(User::factory()->create(['role'=>$role]));
   $this->getJson("/api/conversations/$id")->assertForbidden();
   $this->postJson("/api/conversations/$id/messages",['body'=>'Intrude','category'=>'message'])->assertForbidden();
   $this->postJson("/api/conversations/$id/read",['message_id'=>1])->assertForbidden();
   $this->postJson('/api/placements/'.$p->id.'/conversation')->assertForbidden();
   $this->getJson('/api/conversations')->assertJsonCount(0,'conversations');
  }
  $s->forceFill(['role'=>'staff_rejected'])->save();Sanctum::actingAs($s);$this->getJson("/api/conversations/$id")->assertForbidden();
 }
 public function test_private_attachments_validation_ended_arrangements_and_notification_ownership():void {
  Storage::fake('local');[$f,$s,$a,$p,$id]=$this->setupChat();
  $this->postJson("/api/conversations/$id/messages",['body'=>'   ','category'=>'message'])->assertUnprocessable();
  $this->postJson("/api/conversations/$id/messages",['body'=>str_repeat('a',5001),'category'=>'message'])->assertUnprocessable();
  $this->postJson("/api/conversations/$id/messages",['body'=>'x','category'=>'unknown'])->assertUnprocessable();
  $this->postJson("/api/conversations/$id/messages",['category'=>'health','photo'=>UploadedFile::fake()->create('evil.svg',1,'image/svg+xml')])->assertUnprocessable();
  // A real tiny PNG avoids requiring the GD extension in this test environment.
  $photo=UploadedFile::fake()->createWithContent('pet.png',base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII='));
  $mid=$this->postJson("/api/conversations/$id/messages",['category'=>'health','photo'=>$photo])->assertCreated()->assertJsonMissingPath('photo_path')->json('id');
  $this->getJson("/api/messages/$mid/photo")->assertOk();
  Sanctum::actingAs(User::factory()->create());$this->getJson("/api/messages/$mid/photo")->assertForbidden();
  $n=UserNotification::where('user_id',$s->id)->first();$this->postJson('/api/notifications/'.$n->id.'/read')->assertNotFound();
  Sanctum::actingAs($f);$p->update(['status'=>'Returned']);$this->getJson("/api/conversations/$id")->assertOk();$this->postJson("/api/conversations/$id/messages",['body'=>'After end','category'=>'message'])->assertUnprocessable();
  $this->deleteJson("/api/conversations/$id/messages/$mid")->assertNotFound();
 }

 public function test_staff_initiates_without_assignment_and_foster_replies():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  $this->assertNull($a->shelter_key);
  // A second authorized staff member needs no manual chat membership or assignment.
  $team=User::factory()->create(['role'=>'admin']);$team->forceFill(['shelter_key'=>$s->shelter_key])->save();
  Sanctum::actingAs($team);
  $this->getJson('/api/conversations')->assertJsonPath('placements.0.id',$p->id)->assertJsonPath('conversations.0.id',$id);
  $this->postJson('/api/placements/'.$p->id.'/conversation')->assertOk()->assertJsonPath('id',$id);
  $first=$this->postJson("/api/conversations/$id/messages",['body'=>'Please share a health update','category'=>'health'])->assertCreated()->json('id');
  $this->assertDatabaseHas('user_notifications',['user_id'=>$f->id,'link'=>"/messages/$id"]);
  Sanctum::actingAs($f);
  $this->getJson('/api/conversations')->assertJsonCount(0,'placements')->assertJsonPath('unread',1);
  $this->postJson('/api/placements/'.$p->id.'/conversation')->assertForbidden();
  $this->getJson("/api/conversations/$id")->assertOk()->assertJsonPath('messages.0.id',$first);
  $this->postJson("/api/conversations/$id/messages",['body'=>'Milo is doing well','category'=>'adjustment'])->assertCreated();
  $this->getJson("/api/conversations/$id")->assertJsonCount(2,'messages');
  $this->assertSame(1,Conversation::where('placement_id',$p->id)->count());
  $this->patchJson('/api/admin/animals/'.$a->id.'/messaging-shelter',['staff_id'=>$s->id])->assertNotFound();
 }
 public function test_only_active_foster_arrangements_can_start_or_send_and_history_is_retained():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();Sanctum::actingAs($s);
  foreach(['Returned','Adopted'] as $status){
   $p->update(['status'=>$status]);
   $this->getJson('/api/conversations')->assertJsonCount(0,'placements')->assertJsonPath('conversations.0.can_send',false);
   $this->postJson('/api/placements/'.$p->id.'/conversation')->assertUnprocessable();
   $this->postJson("/api/conversations/$id/messages",['body'=>'Late message','category'=>'message'])->assertUnprocessable();
   $this->getJson("/api/conversations/$id")->assertOk();
  }
  $p->update(['status'=>'Active']);
  foreach(['Awaiting Foster','Under Review','Adopted'] as $status){
   $a->update(['status'=>$status]);
   $this->getJson('/api/conversations')->assertJsonCount(0,'placements')->assertJsonCount(0,'conversations');
   $this->postJson('/api/placements/'.$p->id.'/conversation')->assertUnprocessable();
   $this->postJson("/api/conversations/$id/messages",['body'=>'Not fostered','category'=>'message'])->assertForbidden();
  }
  $a->update(['status'=>'In Foster Care']);
  foreach(['Pending','Rejected','Withdrawn'] as $status){
   $p->application->update(['status'=>$status]);
   $this->getJson('/api/conversations')->assertJsonCount(0,'placements')->assertJsonCount(0,'conversations');
   $this->postJson('/api/placements/'.$p->id.'/conversation')->assertForbidden();
   $this->getJson("/api/conversations/$id")->assertForbidden();
  }
  $this->assertDatabaseHas('conversations',['id'=>$id]);
 }
 public function test_no_placement_means_no_chat_and_ended_placements_cannot_create_new_history():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  Sanctum::actingAs($s);
  $app=$p->application->replicate();$app->status='Pending';$app->save();
  $this->getJson('/api/conversations')->assertJsonCount(1,'placements');
  $this->postJson('/api/placements/999999/conversation')->assertNotFound();
  $ended=Placement::create(['animal_id'=>$a->id,'foster_application_id'=>$app->id,'foster_start_date'=>today(),'status'=>'Returned']);
  $app->update(['status'=>'Approved']);
  $this->postJson('/api/placements/'.$ended->id.'/conversation')->assertUnprocessable();
  $this->assertDatabaseMissing('conversations',['placement_id'=>$ended->id]);
  Sanctum::actingAs($f);$this->postJson('/api/placements/'.$ended->id.'/conversation')->assertForbidden();
 }
 public function test_super_admin_approval_uses_existing_animal_creator_without_granting_super_admin_access():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  $super=User::factory()->create(['role'=>'super_admin']);$p->application->update(['decided_by'=>$super->id]);
  \App\Models\AnimalEvent::log($a->id,'Added to Companio by '.$s->name,$s->id);
  Sanctum::actingAs($s);$this->getJson("/api/conversations/$id")->assertOk();
  Sanctum::actingAs($super);$this->getJson("/api/conversations/$id")->assertForbidden();
  $this->postJson('/api/placements/'.$p->id.'/conversation')->assertForbidden();
  \App\Models\AnimalEvent::where('animal_id',$a->id)->delete();
  Sanctum::actingAs($s);$this->getJson("/api/conversations/$id")->assertForbidden();
 }
 public function test_legacy_staff_identity_never_grants_all_shelters_access_and_pending_history_is_private():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();$s->forceFill(['shelter_key'=>null])->save();
  Sanctum::actingAs($s);$this->getJson("/api/conversations/$id")->assertOk();
  $outsider=User::factory()->create(['role'=>'admin']);Sanctum::actingAs($outsider);
  $this->getJson("/api/conversations/$id")->assertForbidden();
  $this->postJson('/api/placements/'.$p->id.'/conversation')->assertForbidden();
  $p->application->update(['status'=>'Pending']);Sanctum::actingAs($f);
  $this->getJson("/api/conversations/$id")->assertForbidden();
  $this->postJson("/api/conversations/$id/read",['message_id'=>1])->assertForbidden();
 }
 public function test_unified_inbox_excludes_duplicate_chat_alerts_and_reads_only_owned_updates():void {
  [$f,$s,$a,$p,$id]=$this->setupChat();
  Sanctum::actingAs($s);$this->postJson("/api/conversations/$id/messages",['body'=>'How is Milo?','category'=>'message'])->assertCreated();
  $update=UserNotification::send($f->id,'Application approved','/applications');
  $hidden=UserNotification::send($f->id,'Restricted staff request','/admin/staff-requests');
  $other=UserNotification::send($s->id,'Shelter update','/admin/placements');
  Sanctum::actingAs($f);
  $this->getJson('/api/notifications?inbox=1')->assertOk()->assertJsonPath('unread',1)->assertJsonCount(1,'notifications')->assertJsonPath('notifications.0.id',$update->id);
  $this->getJson('/api/conversations')->assertJsonPath('unread',1);
  $this->postJson('/api/notifications/'.$other->id.'/read?inbox=1')->assertNotFound();
  $this->postJson('/api/notifications/'.$hidden->id.'/read?inbox=1')->assertNotFound();
  $this->postJson('/api/notifications/read?inbox=1')->assertOk();
  $this->assertNotNull($update->fresh()->read_at);$this->assertNull($hidden->fresh()->read_at);$this->assertNull($other->fresh()->read_at);
  $this->getJson('/api/notifications?inbox=1')->assertJsonPath('unread',0);
  // Reading system updates must never clear a private conversation's unread state.
  $this->getJson('/api/conversations')->assertJsonPath('unread',1);
  $this->assertNull(UserNotification::where('user_id',$f->id)->where('link',"/messages/$id")->first()->read_at);
 }
 public function test_inbox_update_pagination_and_super_admin_scope_preserve_existing_permissions():void {
  $super=User::factory()->create(['role'=>'super_admin']);
  for($i=0;$i<23;$i++)UserNotification::send($super->id,'Staff update '.$i,'/admin/staff-requests');
  Sanctum::actingAs($super);
  $page=$this->getJson('/api/notifications?inbox=1')->assertOk()->assertJsonCount(20,'notifications')->assertJsonPath('unread',23)->assertJsonPath('has_more',true)->json('notifications');
  $this->getJson('/api/notifications?inbox=1&before='.end($page)['id'])->assertJsonCount(3,'notifications')->assertJsonPath('has_more',false);
  $this->postJson('/api/notifications/'.$page[0]['id'].'/read?inbox=1')->assertOk();
  $this->getJson('/api/notifications?inbox=1')->assertJsonPath('unread',22)->assertJsonPath('notifications.0.id',$page[0]['id']);
  $this->getJson('/api/conversations')->assertJsonCount(0,'conversations')->assertJsonCount(0,'placements');
 }

}

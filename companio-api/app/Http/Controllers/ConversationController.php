<?php
namespace App\Http\Controllers;
use App\Models\{AnimalEvent,Conversation,Message,Placement,User,UserNotification};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB,Storage};
class ConversationController extends Controller {
 // The approved application identifies the shelter through its existing decision record.
 // Super Admin approval does not grant private chat access; use the animal's creator then.
 private function staff(Placement $p) {
  $owner=$p->application?->decider;
  if (!$owner || $owner->role==='super_admin') {
   $event=AnimalEvent::where('animal_id',$p->animal_id)->where('message','like','Added to Companio by %')->oldest('id')->first();
   $owner=$event?->user;
  }
  if (!$owner || $owner->role!=='admin') return collect();
  return User::where('role','admin')->whereNull('archived_at')
   ->when($owner->shelter_key,fn($q)=>$q->where('shelter_key',$owner->shelter_key),fn($q)=>$q->whereKey($owner->id))->get();
 }
 private function validPlacement(Placement $p): bool {
  return $p->animal && $p->application?->status==='Approved' && $p->application->animal_id===$p->animal_id;
 }
 private function active(Placement $p): bool {
  return $this->validPlacement($p) && $p->status==='Active' && $p->animal->status==='In Foster Care';
 }
 private function eligible(User $u, Placement $p): bool {
  if($u->archived_at || !$this->validPlacement($p)) return false;
  return ($u->role==='volunteer' && $p->application->user_id===$u->id)
   || ($u->role==='admin' && $this->staff($p)->contains('id',$u->id));
 }
 private function participants(Conversation $c): void {
  $ids=$this->staff($c->placement)->pluck('id');
  $foster=$c->placement->application?->user;
  if($foster && $foster->role==='volunteer' && !$foster->archived_at) $ids->push($foster->id);
  $c->participants()->sync($ids->unique()->all());
  $c->unsetRelation('participants');
 }
 private function authorizeChat(Request $r,Conversation $c): void {
  abort_unless($this->eligible($r->user(),$c->placement),403);
  abort_unless($this->active($c->placement) || in_array($c->placement->status,['Returned','Adopted'],true),403);
  $this->participants($c);
 }
 private function visible(Request $r) {
  return Conversation::with(['placement.animal','placement.application.decider','placement.application.user'])->get()->filter(fn($c)=>$this->eligible($r->user(),$c->placement) && ($this->active($c->placement) || in_array($c->placement->status,['Returned','Adopted'],true)));
 }
 public function index(Request $r){
  $items=$this->visible($r)->map(function($c)use($r){
   $this->participants($c);
   $last=$c->participants->firstWhere('id',$r->user()->id)->pivot->last_read_message_id;
   return ['id'=>$c->id,'placement_id'=>$c->placement_id,'pet'=>$c->placement->animal->only(['id','name','species','photo_url']),'status'=>$c->placement->status,'can_send'=>$this->active($c->placement),'participants'=>$c->participants->map(fn($u)=>$u->only(['id','name','photo_url'])),'unread'=>$c->messages()->where('id','>',$last)->where('sender_id','!=',$r->user()->id)->count(),'latest'=>$c->messages()->latest('id')->first()];
  })->sortByDesc(fn($c)=>$c['latest']?->id ?? 0)->values();
  $placements=$r->user()->role==='admin'
   ? Placement::where('status','Active')->with(['animal','application.decider'])->get()->filter(fn($p)=>$this->active($p) && $this->eligible($r->user(),$p))->map(fn($p)=>['id'=>$p->id,'name'=>$p->animal->name,'foster_name'=>$p->application->full_name,'status'=>$p->status])->values()
   : collect();
  return response()->json(['conversations'=>$items,'placements'=>$placements,'unread'=>$items->sum('unread')]);
 }
 public function start(Request $r,Placement $placement){
  abort_unless($r->user()->role==='admin',403,'Shelter staff initiate foster conversations.');
  return DB::transaction(function()use($r,$placement){
   $placement->animal()->lockForUpdate()->firstOrFail();
   $placement=Placement::lockForUpdate()->findOrFail($placement->id);
   abort_unless($this->eligible($r->user(),$placement),403);
   abort_unless($this->active($placement),422,'Messaging is available only for an active foster arrangement.');
   $c=Conversation::firstOrCreate(['placement_id'=>$placement->id]);
   $this->participants($c);
   return response()->json(['id'=>$c->id]);
  });
 }
 public function show(Request $r,Conversation $conversation){
  $this->authorizeChat($r,$conversation);
  $r->validate(['before'=>'nullable|integer|min:1']);
  $messages=$conversation->messages()->with('sender:id,name,photo_url')->when($r->before,fn($q)=>$q->where('id','<',$r->before))->latest('id')->limit(50)->get()->reverse()->values();
  return response()->json(['messages'=>$messages,'participants'=>$conversation->participants()->get(['users.id','name','photo_url']),'has_more'=>$messages->isNotEmpty() && $conversation->messages()->where('id','<',$messages->first()->id)->exists()]);
 }
 public function read(Request $r,Conversation $conversation){
  $this->authorizeChat($r,$conversation);
  $v=$r->validate(['message_id'=>'required|integer|min:1']);
  abort_unless($conversation->messages()->whereKey($v['message_id'])->exists(),422);
  DB::table('conversation_participants')->where('conversation_id',$conversation->id)->where('user_id',$r->user()->id)->where('last_read_message_id','<',$v['message_id'])->update(['last_read_message_id'=>$v['message_id']]);
  return response()->json(['message'=>'Read status saved.']);
 }
 public function send(Request $r,Conversation $conversation){
  $this->authorizeChat($r,$conversation);
  abort_unless($this->active($conversation->placement),422,'Messaging is available only for active foster arrangements. Ended arrangements retain read-only history.');
  $v=$r->validate(['body'=>'nullable|required_without:photo|string|max:5000','category'=>'required|in:message,health,behavior,feeding,adjustment','photo'=>'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120|dimensions:max_width=10000,max_height=10000']);
  abort_if(!trim($v['body']??'') && !$r->hasFile('photo'),422,'Write a message or attach a photo.');
  $path=$r->file('photo')?->store('conversation-photos','local');
  try {
   $message=DB::transaction(function()use($r,$conversation,$v,$path){
    $conversation->placement->animal()->lockForUpdate()->firstOrFail();
    $placement=Placement::lockForUpdate()->findOrFail($conversation->placement_id);
    $conversation->setRelation('placement',$placement);
    $this->authorizeChat($r,$conversation);
    abort_unless($this->active($placement),422,'This foster arrangement is no longer active.');
    $m=$conversation->messages()->create(['sender_id'=>$r->user()->id,'body'=>trim($v['body']??''),'category'=>$v['category'],'photo_path'=>$path]);
    foreach($conversation->participants as $u){
     if($u->id!==$r->user()->id && $this->eligible($u,$conversation->placement)) UserNotification::send($u->id,$r->user()->name.' sent '.($v['category']==='message'?'a message':'a '.$v['category'].' update').' about '.$conversation->placement->animal->name,($u->role==='admin'?'/admin/messages/':'/messages/').$conversation->id);
    }
    return $m;
   });
  } catch(\Throwable $e){if($path) Storage::disk('local')->delete($path);throw $e;}
  return response()->json($message->load('sender:id,name,photo_url'),201);
 }
 public function photo(Request $r,Message $message){
  $this->authorizeChat($r,$message->conversation);
  abort_unless($message->photo_path && Storage::disk('local')->exists($message->photo_path),404);
  return Storage::disk('local')->response($message->photo_path,null,['Cache-Control'=>'private, no-store','X-Content-Type-Options'=>'nosniff'],'inline');
 }
}

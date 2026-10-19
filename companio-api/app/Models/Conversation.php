<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Conversation extends Model {
 protected $fillable=['placement_id'];
 public function placement(){return $this->belongsTo(Placement::class);}
 public function participants(){return $this->belongsToMany(User::class,'conversation_participants')->withPivot('last_read_message_id');}
 public function messages(){return $this->hasMany(Message::class);}
}

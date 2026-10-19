<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Message extends Model {
 protected $guarded=['id'];
 protected $hidden=['photo_path'];
 protected $appends=['has_photo'];
 public function getHasPhotoAttribute(){return (bool)$this->photo_path;}
 public function sender(){return $this->belongsTo(User::class,'sender_id');}
 public function conversation(){return $this->belongsTo(Conversation::class);}
}

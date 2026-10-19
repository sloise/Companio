<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::table('animals', function(Blueprint $t) { $t->string('shelter_key',64)->nullable()->index(); });
  Schema::create('conversations', function(Blueprint $t) {
   $t->id(); $t->foreignId('placement_id')->unique()->constrained()->cascadeOnDelete(); $t->timestamps();
  });
  Schema::create('conversation_participants', function(Blueprint $t) {
   $t->id(); $t->foreignId('conversation_id')->constrained()->cascadeOnDelete(); $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->unsignedBigInteger('last_read_message_id')->default(0); $t->unique(['conversation_id','user_id']);
  });
  Schema::create('messages', function(Blueprint $t) {
   $t->id(); $t->foreignId('conversation_id')->constrained()->cascadeOnDelete(); $t->foreignId('sender_id')->constrained('users'); $t->text('body')->nullable(); $t->string('category',30)->default('message'); $t->string('photo_path')->nullable(); $t->timestamps(); $t->index(['conversation_id','id']);
  });
 }
 public function down(): void {
  Schema::dropIfExists('messages'); Schema::dropIfExists('conversation_participants'); Schema::dropIfExists('conversations'); Schema::table('animals',fn(Blueprint $t)=>$t->dropColumn('shelter_key'));
 }
};

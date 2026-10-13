<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('volunteer_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('housing_type');                 // apartment | house | townhouse | dormitory
            $table->string('yard');                         // none | small | fenced
            $table->boolean('has_cats')->default(false);
            $table->boolean('has_dogs')->default(false);
            $table->string('kids');                         // none | older (10+) | young (under 10)
            $table->unsignedTinyInteger('hours_alone');     // 4 | 8 | 12 (upper limit of daily hours alone)
            $table->string('experience');                   // first_time | some | experienced
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('volunteer_profiles');
    }
};

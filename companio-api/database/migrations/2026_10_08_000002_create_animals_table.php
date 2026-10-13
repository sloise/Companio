<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('animals', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('species');                    // dog | cat
            $table->string('breed')->nullable();
            $table->string('sex')->nullable();            // Male | Female
            $table->string('age');                        // e.g. "3 yrs", "4 mos"
            $table->text('description')->nullable();
            $table->string('photo_url', 500)->nullable();

            // ---- Care rules (compared with the volunteer's home) ----
            $table->boolean('apartment_ok')->default(true);      // can live in an apartment
            $table->boolean('needs_yard')->default(false);       // needs a fenced yard
            $table->boolean('good_with_cats')->default(true);
            $table->boolean('good_with_dogs')->default(true);
            $table->string('kids_ok')->default('any');           // any | older (10+) | none
            $table->unsignedTinyInteger('max_hours_alone')->default(8); // 4 | 8 | 12

            $table->boolean('is_urgent')->default(false);
            // Awaiting Foster | Under Review | In Foster Care | Adopted
            $table->string('status')->default('Awaiting Foster');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('animals');
    }
};

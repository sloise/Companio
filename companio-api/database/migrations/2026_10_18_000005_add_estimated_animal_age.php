<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->string('sterilization_status')->default('Unknown')->change();
            $table->unsignedSmallInteger('estimated_age_years')->nullable();
            $table->unsignedTinyInteger('estimated_age_months')->nullable();
        });
        // Convert only unambiguous legacy ages; preserve their original strings for rollback.
        DB::table('animals')->whereNull('birth_date')->orderBy('id')->chunkById(100, function ($animals) {
            foreach ($animals as $animal) {
                if (preg_match('/^\s*(\d+)\s*(years?|yrs?|months?|mos?)\s*$/i', $animal->age, $match)) {
                    $total = (int) $match[1] * (str_starts_with(strtolower($match[2]), 'y') ? 12 : 1);
                    if ($total <= 1211) {
                        DB::table('animals')->where('id', $animal->id)->update(['estimated_age_years' => intdiv($total, 12), 'estimated_age_months' => $total % 12]);
                    }
                }
            }
        });
        // Normalize only the previous status vocabulary.
        DB::table('animals')->where('sterilization_status', 'Unknown/No Records')->update(['sterilization_status' => 'Unknown']);
        DB::table('animals')->where('sterilization_status', 'Not Yet Spayed/Neutered')->where('sex', 'Female')->update(['sterilization_status' => 'Not Yet Spayed']);
        DB::table('animals')->where('sterilization_status', 'Not Yet Spayed/Neutered')->where('sex', 'Male')->update(['sterilization_status' => 'Not Yet Neutered']);
        DB::table('animals')->where(function ($q) {
            $q->whereNull('sex')->orWhereNotIn('sex', ['Male', 'Female']);
        })->update(['sterilization_status' => 'Unknown']);
        DB::table('animals')->where('sex', 'Female')->whereNotIn('sterilization_status', ['Spayed', 'Not Yet Spayed', 'Unknown'])->update(['sterilization_status' => 'Unknown']);
        DB::table('animals')->where('sex', 'Male')->whereNotIn('sterilization_status', ['Neutered', 'Not Yet Neutered', 'Unknown'])->update(['sterilization_status' => 'Unknown']);
    }

    public function down(): void
    {
        DB::table('animals')->whereIn('sterilization_status', ['Not Yet Spayed', 'Not Yet Neutered'])->update(['sterilization_status' => 'Not Yet Spayed/Neutered']);
        DB::table('animals')->where('sterilization_status', 'Unknown')->update(['sterilization_status' => 'Unknown/No Records']);
        Schema::table('animals', function (Blueprint $table) {
            $table->string('sterilization_status')->default('Unknown/No Records')->change();
            $table->dropColumn(['estimated_age_years', 'estimated_age_months']);
        });
    }
};

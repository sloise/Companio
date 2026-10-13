import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useAuth } from "../context/auth";
import MatchRow from "../components/MatchRow";
import Tour from "../components/Tour";
import { LoadError, Skeleton } from "../components/PageStates";
import useSavedPets from "../utils/useSavedPets";
import { MATCH_OPTIONS } from "../constants";

// the welcome tour is "pending" for a user right after they create their account
function tourIsPending(userId) {
  try {
    return localStorage.getItem(`companio_tour_${userId}`) === "pending";
  } catch {
    return false;
  }
}

function markTourDone(userId) {
  try {
    localStorage.removeItem(`companio_tour_${userId}`);
  } catch {
    // storage blocked - nothing to clear
  }
}

const DEFAULT_FILTERS = {
  search: "",
  dogs: true,
  cats: true,
  urgent: false,
  savedOnly: false,
  min_match: 60,
  sort: "match",
};

const SORT_NOTES = {
  match: "Sorted by best match first. Urgent pets are flagged.",
  urgent: "Urgent pets first, then best match.",
  newest: "Newest arrivals first.",
};

// One short line describing the volunteer's home, e.g. "Apartment · no yard · cat at home · no kids · away 4–8 hrs"
function homeSummary(profile) {
  const housing = { apartment: "Apartment", house: "House", townhouse: "Townhouse", dormitory: "Dormitory" };
  const yard = { none: "no yard", small: "small yard", fenced: "fenced yard" };
  const kids = { none: "no kids", older: "kids 10+", young: "kids under 10" };
  const hours = { 4: "away under 4 hrs", 8: "away 4–8 hrs", 12: "away 8+ hrs" };

  const pets = [];
  if (profile.has_cats) pets.push("cat at home");
  if (profile.has_dogs) pets.push("dog at home");

  return [
    housing[profile.housing_type],
    yard[profile.yard],
    pets.length ? pets.join(" · ") : "no other pets",
    kids[profile.kids],
    hours[profile.hours_alone],
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function MatchFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pets, setPets] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to try loading again

  // SAVED PETS (heart button)
  const { saved, isSaved, toggleSaved, forget } = useSavedPets();
  const foundHomes = saved.filter((pet) => !pet.open);

  // SEARCH + FILTER values. Species is filtered here in the browser so the counts stay visible.
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // WELCOME TOUR - starts for new accounts, or from "Take the tour" in the account menu (?tour=1)
  const [searchParams, setSearchParams] = useSearchParams();
  const [tourPending, setTourPending] = useState(() => tourIsPending(user.id));
  const showTour = !loading && (tourPending || searchParams.get("tour") === "1");

  const finishTour = () => {
    markTourDone(user.id);
    setTourPending(false);
    setSearchParams({}, { replace: true });
  };

  const tourSteps = useMemo(() => [
    {
      title: `Welcome to Companio, ${user.name.split(" ")[0]}!`,
      body: "Here's a quick look at how to find a pet to foster. It takes about 30 seconds.",
    },
    {
      target: ".filter-panel",
      title: "Narrow down your matches",
      body: "Search by name, choose dogs or cats, set a minimum match score, or show only urgent pets.",
    },
    {
      target: ".match-row .match-row-score",
      title: "Your match score",
      body: "Shelter staff set five care rules for every pet. Each rule your home meets adds 20%, so 100% means a perfect fit.",
    },
    {
      target: ".match-row .fit-tags",
      title: "What fits and what doesn't",
      body: "✓ tags are rules your home meets. ✕ tags show what doesn't fit, so you know before you apply.",
    },
    {
      target: ".match-row .btn-dark",
      title: "See a pet's profile",
      body: "Open a profile to read about the pet, see how it fits your home, and send a foster request.",
    },
    {
      target: ".match-row .save-btn",
      title: "Save pets you like",
      body: "Tap the heart to save a pet. Turn on \"Saved pets only\" in the filters to see them again.",
    },
    {
      target: '[data-tour="nav-applications"]',
      title: "Track your requests",
      body: "After you apply, check here to see if the shelter has approved your request.",
    },
    {
      target: '[data-tour="nav-profile"]',
      title: "Your home profile",
      body: "Moved or got a new pet? Update your answers here and your match scores update too.",
    },
    {
      target: '[data-tour="account"]',
      title: "You're all set!",
      body: "You can replay this tour any time from your account menu.",
    },
  ], [user.name]);

  // READ - the home profile (used for the "Your home" summary). No profile? ask the questionnaire first.
  useEffect(() => {
    const getProfile = async () => {
      try {
        const response = await api.get("/profile");

        if (!response.data?.id) {
          navigate("/questionnaire", { replace: true });
          return;
        }

        setProfile(response.data);
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    };

    getProfile();
  }, [navigate]);

  // READ - the match feed, reloaded whenever a server-side filter changes
  useEffect(() => {
    const getMatches = async () => {
      try {
        const response = await api.get("/matches", {
          params: {
            search: filters.search || undefined,
            urgent: filters.urgent ? 1 : undefined,
            min_match: filters.min_match,
            sort: filters.sort,
          },
        });

        setPets(response.data);
        setLoadError("");
      } catch (error) {
        if (error.response?.data?.needs_profile) {
          navigate("/questionnaire", { replace: true });
          return;
        }
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    // wait a moment while the user is still typing
    const timer = setTimeout(getMatches, 250);
    return () => clearTimeout(timer);
  }, [filters.search, filters.urgent, filters.min_match, filters.sort, navigate, reload]);

  // INPUT
  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const dogCount = pets.filter((pet) => pet.species === "dog").length;
  const catCount = pets.length - dogCount;

  const shown = pets.filter(
    (pet) => (pet.species === "dog" ? filters.dogs : filters.cats) && (!filters.savedOnly || isSaved(pet.id))
  );
  const firstName = user.name.split(" ")[0];

  return (
    <div className="feed-layout">
      <aside className="card filter-panel" aria-label="Filters">
        <div className="filter-panel-head">
          <h2>Filters</h2>
          <button type="button" className="link-btn" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Reset
          </button>
        </div>

        <label className="search-box">
          <span className="sr-only">Search by name</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search by name"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
        </label>

        <fieldset className="filter-group">
          <legend>Species</legend>
          <label className="filter-check">
            <input type="checkbox" checked={filters.dogs} onChange={(e) => setFilter("dogs", e.target.checked)} />
            Dogs
            <small>{dogCount}</small>
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filters.cats} onChange={(e) => setFilter("cats", e.target.checked)} />
            Cats
            <small>{catCount}</small>
          </label>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Minimum match</legend>
          <div className="pill-choice">
            {MATCH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.min_match === option.value}
                onClick={() => setFilter("min_match", option.value)}
              >
                {option.short}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="filter-toggle">
          Urgent pets only
          <input type="checkbox" checked={filters.urgent} onChange={(e) => setFilter("urgent", e.target.checked)} />
        </label>

        <label className="filter-toggle">
          Saved pets only
          <input type="checkbox" checked={filters.savedOnly} onChange={(e) => setFilter("savedOnly", e.target.checked)} />
        </label>

        {profile && (
          <div className="filter-home">
            <strong>Your home</strong>
            <p className="muted">{homeSummary(profile)}</p>
            <Link to="/questionnaire">Update answers</Link>
          </div>
        )}
      </aside>

      <section className="feed-main" aria-label="Matched pets">
        <div className="feed-head">
          <div>
            <h1>
              Hi {firstName}, {shown.length} {shown.length === 1 ? "pet fits" : "pets fit"} your home
            </h1>
            <p className="muted">{SORT_NOTES[filters.sort]}</p>
          </div>

          <label className="sort-field">
            Sort
            <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
              <option value="match">Best match</option>
              <option value="urgent">Most urgent</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>

        {/* saved pets that were placed with someone since they were saved */}
        {foundHomes.map((pet) => (
          <div className="notice notice-info found-home" key={pet.id} role="status">
            <span>
              <strong>{pet.name}</strong>, who you saved, has found a home
              {pet.status === "Adopted" ? " and was adopted" : " with a foster"}. 🎉
            </span>
            <button type="button" className="link-btn" onClick={() => forget(pet.id)}>
              Dismiss
            </button>
          </div>
        ))}

        {loading ? (
          <Skeleton rows={3} height={158} />
        ) : loadError ? (
          <LoadError message={loadError} onRetry={() => setReload((count) => count + 1)} />
        ) : shown.length === 0 ? (
          <div className="card empty">
            <h2>{filters.savedOnly ? "No saved pets here yet" : "No pets match these filters"}</h2>
            <p className="muted">
              {filters.savedOnly
                ? "Tap the heart on any pet to save it."
                : "Try a lower match percentage, tick both species or clear the search."}
            </p>
            <button type="button" className="btn btn-outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset filters
            </button>
          </div>
        ) : (
          shown.map((pet) => (
            <MatchRow key={pet.id} pet={pet} saved={isSaved(pet.id)} onToggleSave={toggleSaved} />
          ))
        )}
      </section>

      {showTour && <Tour steps={tourSteps} onClose={finishTour} />}
    </div>
  );
}

import { supabase } from "./supabaseClient";

export const DEFAULT_SECTIONS = [
  "Fridge",
  "Freezer",
  "Storage",
  "Bathroom",
  "Spices",
  "Cleaning",
  "Alcohol",
];

export const generateJoinCode = (length = 6) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i += 1) {
      result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
  }
  while (result.length < length) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
};

const normalizeJoinCode = (value) =>
  value ? value.replace(/[^a-z0-9]/gi, "").toUpperCase() : "";

const defaultHouseholdName = (user) => {
  const handle = user?.email ? user.email.split("@")[0] : "My";
  return `${handle}'s Household`;
};

export const createHouseholdForUser = async (user, nameOverride) => {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode(6);
    const householdName = nameOverride?.trim() || defaultHouseholdName(user);
    const { data: rpcData, error: rpcError } = await supabase.rpc("create_household", {
      household_name: householdName,
      join_code: joinCode,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    if (rpcError) {
      lastError = rpcError;
      const missingFunction =
        rpcError.code === "PGRST202" ||
        rpcError.code === "42883" ||
        rpcError.message?.includes("function public.create_household");
      if (!missingFunction) {
        if (rpcError.code === "23505") {
          continue;
        }
        throw rpcError;
      }
    }

    const { data, error } = await supabase
      .from("households")
      .insert([
        {
          name: householdName,
          join_code: joinCode,
          created_by: user.id,
        },
      ])
      .select("id, name, join_code, created_by")
      .single();

    if (error) {
      lastError = error;
      if (error.code === "23505") {
        continue;
      }
      throw error;
    }

    const { error: memberError } = await supabase.from("household_members").insert([
      { household_id: data.id, user_id: user.id, role: "owner" },
    ]);
    if (memberError) throw memberError;

    const { error: settingsError } = await supabase.from("user_settings").upsert([
      { user_id: user.id, active_household_id: data.id },
    ]);
    if (settingsError) throw settingsError;

    return data;
  }

  throw lastError || new Error("Failed to create household");
};

export const fetchHouseholdsForUser = async (userId) => {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, households(id, name, join_code, created_by)")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
};

export const ensureActiveHousehold = async (user) => {
  let memberships = await fetchHouseholdsForUser(user.id);

  let activeHousehold = null;
  if (!memberships.length) {
    return {
      household: null,
      memberships: [],
    };
  } else {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("active_household_id, low_stock_threshold, alert_days")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeId = settings?.active_household_id || memberships[0].households?.id;
    activeHousehold = memberships.find((m) => m.households?.id === activeId)?.households;

    if (!activeHousehold) {
      activeHousehold = memberships[0].households;
    }

    if (activeHousehold && activeId !== settings?.active_household_id) {
      await supabase.from("user_settings").upsert([
        { user_id: user.id, active_household_id: activeHousehold.id },
      ]);
    }
  }

  return {
    household: activeHousehold,
    memberships,
  };
};

export const joinHouseholdByCode = async (userId, joinCode) => {
  const normalized = normalizeJoinCode(joinCode);
  if (!normalized) {
    throw new Error("Join code is required.");
  }
  const { data, error } = await supabase.rpc("join_household", {
    join_code: normalized,
  });

  if (error) throw error;

  const { error: settingsError } = await supabase.from("user_settings").upsert([
    { user_id: userId, active_household_id: data },
  ]);
  if (settingsError) throw settingsError;

  return data;
};

export const setActiveHousehold = async (userId, householdId) => {
  const { error } = await supabase.from("user_settings").upsert([
    { user_id: userId, active_household_id: householdId },
  ]);
  if (error) throw error;
};

export const fetchSections = async (householdId) => {
  const { data, error } = await supabase
    .from("sections")
    .select("id, name, sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
};

export const seedSectionsIfEmpty = async (householdId) => {
  const { data } = await supabase
    .from("sections")
    .select("id")
    .eq("household_id", householdId)
    .limit(1);

  if (data && data.length > 0) return;

  const rows = DEFAULT_SECTIONS.map((name, index) => ({
    household_id: householdId,
    name,
    sort_order: index,
  }));

  const { error } = await supabase.from("sections").insert(rows);
  if (error) throw error;
};

export const addSection = async (householdId, name) => {
  const { data, error } = await supabase
    .from("sections")
    .insert([{ household_id: householdId, name, sort_order: 0 }])
    .select("id, name, sort_order")
    .single();

  if (error) throw error;
  return data;
};

export const removeSection = async (sectionId) => {
  const { error } = await supabase.from("sections").delete().eq("id", sectionId);
  if (error) throw error;
};

export const fetchTagRules = async (householdId) => {
  const { data, error } = await supabase
    .from("tag_rules")
    .select("id, tag, alert_days, low_stock_threshold")
    .eq("household_id", householdId)
    .order("tag", { ascending: true });

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return data || [];
};

export const upsertTagRule = async (householdId, tag, alertDays, lowStockThreshold) => {
  const { data, error } = await supabase
    .from("tag_rules")
    .upsert(
      [
        {
          household_id: householdId,
          tag,
          alert_days: alertDays,
          low_stock_threshold: lowStockThreshold,
        },
      ],
      { onConflict: "household_id,tag" }
    )
    .select("id, tag, alert_days, low_stock_threshold")
    .single();

  if (error) throw error;
  return data;
};

export const deleteTagRule = async (householdId, tag) => {
  const { error } = await supabase
    .from("tag_rules")
    .delete()
    .eq("household_id", householdId)
    .eq("tag", tag);

  if (error) throw error;
};

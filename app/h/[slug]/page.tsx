"use client";

import { use, useState } from "react";
import { supabase } from "@/lib/supabase";

const houses: Record<string, { name: string; slug: string }[]> = {
  "25674": [
    { name: "Ahmad", slug: "ahmad" },
    { name: "Fatima", slug: "fatima" },
    { name: "Security", slug: "security" },
  ],
  "99999": [
    { name: "John", slug: "john" },
    { name: "Mary", slug: "mary" },
    { name: "Guard", slug: "guard" },
  ],
};

export default function HousePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const residents = houses[slug];
  const [loading, setLoading] = useState<string | null>(null);

  async function createCall(resident: string) {
    setLoading(resident);
    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          house_slug: slug,
          resident_slug: resident,
          status: "calling",
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.log(error);
      return;
    }

    

    window.location.href = `/h/${slug}/call/${resident}?callId=${data.id}`;
  }

  if (!residents) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-3xl font-bold">House not found</h1>
        <p className="text-gray-500">No residents were found for this house.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <h1 className="text-3xl font-bold">House {slug}</h1>

      <p className="text-gray-500">Who do you want to call?</p>
      
      
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {residents.map((resident) => (
          <button
  key={resident.slug}
  type="button"
  onClick={() => createCall(resident.slug)}
  disabled={loading === resident.slug}
  className={
    resident.slug === "security"
      ? "bg-gray-300 py-3 rounded-lg text-black"
      : "bg-black text-white py-3 rounded-lg"
  }
>
  {loading === resident.slug ? "Calling..." : `Call ${resident.name}`}
</button>
        ))}
      </div>
    </div>
  );
}
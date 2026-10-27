"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { createAddressAction } from "@/features/addresses/actions/address.actions";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { AddressModal } from "@/features/addresses/components/AddressModal";
import type { AddressInput } from "@/features/addresses/schemas/address.schema";
import type { Address } from "@/features/addresses/types/address.types";

// `label` is still a required field on `addressSchema`, but the modal no
// longer has a picker for it (removed along with the Home/Work toggle) — a
// new address just defaults to "Home".
const EMPTY_INPUT: AddressInput = {
  label: "Home",
  recipientName: "",
  phone: "",
  region: "",
  province: "",
  city: "",
  barangay: "",
  streetDetails: "",
  postalCode: "",
};

/**
 * The `/addresses` management section: a toolbar (saved count + "+ Add
 * address", top-right), the saved addresses as a card grid with the default
 * first, and a centered add-address modal (`AddressModal`, shared with
 * `AddressCard`'s Edit).
 */
export function AddressList({ addresses }: { addresses: Address[] }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  // Default first, otherwise the order the server returned.
  const ordered = [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
          Saved addresses · {addresses.length}
        </p>
        <Button type="button" variant="rj" size="rjSm" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add address
        </Button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          title="No saved addresses yet"
          description="Add an address to speed up checkout next time."
          action={
            <Button type="button" variant="rj" size="rjSm" onClick={() => setIsAddOpen(true)}>
              Add address
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ordered.map((address) => (
            <li key={address.id}>
              <AddressCard address={address} />
            </li>
          ))}
        </ul>
      )}

      {isAddOpen ? (
        <AddressModal
          title="New Address"
          initialValues={EMPTY_INPUT}
          onCancel={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            const result = await createAddressAction(input);
            if (result.success) setIsAddOpen(false);
            return result;
          }}
        />
      ) : null}
    </div>
  );
}

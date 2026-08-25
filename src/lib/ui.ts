// src/lib/ui.ts
// Unified visual identity — mirrors the design language of src/app/settings/page.tsx
// so every page uses the exact same buttons, cards, inputs, headers and toasts.

export const btnBase =
  "rounded-2xl font-black text-white flex items-center justify-center gap-3 transition-all";

export const btn = {
  green: `${btnBase} bg-[#26890c] hover:bg-[#20730a] border-b-4 border-[#165406] active:border-b-0 active:translate-y-1 shadow-lg`,
  blue: `${btnBase} bg-[#0087ed] hover:bg-[#0073cc] border-b-4 border-[#005fa3] active:border-b-0 active:translate-y-1 shadow-lg`,
  yellow: `${btnBase} bg-[#ffb800] text-gray-900 border-b-4 border-[#cc9400] active:border-b-0 active:translate-y-1 shadow-lg`,
  red: `${btnBase} bg-[#eb1f36] hover:bg-[#c9172c] border-b-4 border-[#b51427] active:border-b-0 active:translate-y-1 shadow-lg`,
  disabled: `${btnBase} bg-gray-500 cursor-not-allowed`,
  ghost: "py-3 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 text-gray-600 hover:bg-purple-50",
};

export const compact = {
  blue: "bg-[#0087ed] text-white px-5 py-2.5 rounded-2xl font-black hover:bg-[#0073cc] transition-all shadow-md",
  green: "bg-[#26890c] text-white px-5 py-2.5 rounded-2xl font-black hover:bg-[#20730a] transition-all shadow-md",
  red: "bg-[#eb1f36] text-white px-5 py-2.5 rounded-2xl font-black hover:bg-[#c9172c] transition-all shadow-md",
};

export const icon = {
  blue: "flex items-center justify-center text-white bg-[#0087ed] hover:bg-[#0073cc] p-2.5 rounded-xl transition-all shadow-sm",
  green: "flex items-center justify-center text-white bg-[#26890c] hover:bg-[#20730a] p-2.5 rounded-xl transition-all shadow-sm",
  red: "flex items-center justify-center text-white bg-[#eb1f36] hover:bg-[#c9172c] p-2.5 rounded-xl transition-all shadow-sm",
  purple: "flex items-center justify-center text-white bg-[#46178f] hover:bg-[#380e6e] p-2.5 rounded-xl transition-all shadow-sm",
};

export const header =
  "bg-gradient-to-r from-[#46178f] to-[#7b2cbf] text-white rounded-3xl shadow-xl border-b-8 border-[#321067]";

export const card = "bg-white shadow-xl border-2 border-purple-100";

export const panel = `${card} rounded-3xl`;

const _inputBase =
  "bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all";

export const input: string & { group: string; label: string; field: string } = Object.assign(
  _inputBase as string,
  {
    group: "space-y-2",
    label: "block text-sm font-black text-gray-700 mb-1.5",
    field: _inputBase,
  }
);

export const inputSmall =
  "bg-white border-2 border-purple-100 rounded-2xl p-3 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all text-sm";

export const toast =
  "fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 p-4 rounded-2xl shadow-2xl font-black text-white animate-in slide-in-from-top-2 duration-300 border-4 border-white/20";

export const table = {
  head: "bg-purple-50 border-b-2 border-purple-200 text-[#46178f]",
  row: "border-b border-purple-100 hover:bg-purple-50/50 transition-colors",
};

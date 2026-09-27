"use client";
// src/components/predict/PredictForm.tsx
// Smart Executive Prediction Form with 4 Icon Sections & Dynamic State -> District Dropdown

import { useState, useMemo } from "react";
import { Loader2, Building2, PieChart, AlertTriangle, Sparkles, Scale, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { predictRisk } from "@/services/predictionService";
import { USE_MOCK } from "@/services/api";
import { ALL_INDIAN_STATES, getDistrictsForState } from "@/data/districtData";
import { RFCTLARR_STAGES } from "@/components/projects/StageTimeline";
import type { PredictionRequest, PredictionResponse, AcquisitionStage } from "@/types";
import PredictionResult from "./PredictionResult";

const PROJECT_TYPES = [
  "Highway", "Industrial Corridor", "Metro Rail", "Airport",
  "Irrigation", "Railway", "Power Plant", "Smart City", "Port",
];

const CLEARANCE_OPTIONS = ["Approved", "Pending", "Not Required"];

const PROCESSING_STEPS = [
  "Validating Project Inputs",
  "Processing State & District Parameters",
  "Running XGBoost ML Delay Model",
  "Calculating SHAP Risk Factors",
  "Generating AI Recommendations",
];

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}

function Field({ label, required, children, hint, error }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-[#687386] uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[10px] text-red-600 font-semibold">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-[#687386]">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full px-3.5 py-2.5 text-[13px] border border-[#e6eaf0] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#2457d6]/30 text-[#172033] shadow-2xs";

const selectCls =
  "w-full px-3.5 py-2.5 text-[13px] border border-[#e6eaf0] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#2457d6]/30 text-[#172033] cursor-pointer disabled:bg-[#f8fafc] disabled:text-gray-400 disabled:cursor-not-allowed shadow-2xs";

interface PredictFormProps {
  initialValues?: PredictionRequest | null;
}

export default function PredictForm({ initialValues }: PredictFormProps = {}) {
  const [form, setForm] = useState<Partial<PredictionRequest>>(() => ({
    projectName: initialValues?.projectName || "",
    state: initialValues?.state || "Maharashtra",
    district: initialValues?.district || "Nashik",
    projectType: initialValues?.projectType || "Highway",
    totalLandRequired: initialValues?.totalLandRequired ?? 120,
    landAcquiredPercentage: initialValues?.landAcquiredPercentage ?? 45,
    landPossessionPercentage: initialValues?.landPossessionPercentage ?? 30,
    pendingApprovals: initialValues?.pendingApprovals ?? 4,
    compensationPendingPercentage: initialValues?.compensationPendingPercentage ?? 55,
    legalDisputes: initialValues?.legalDisputes ?? 2,
    ownershipDisputes: initialValues?.ownershipDisputes ?? 1,
    affectedFamilies: initialValues?.affectedFamilies ?? 50,
    displacedFamilies: initialValues?.displacedFamilies ?? 15,
    rrCompletionPercentage: initialValues?.rrCompletionPercentage ?? 40,
    environmentClearance: initialValues?.environmentClearance || "Approved",
    forestClearance: initialValues?.forestClearance || "Pending",
    previousDelay: initialValues?.previousDelay || false,
    currentStage: (initialValues?.currentStage || "Preliminary Notification (Section 11)") as AcquisitionStage,
  }));

  const [stageStartDate, setStageStartDate] = useState("2026-08-10");
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");

  const SCENARIOS = [
    {
      id: "healthy",
      label: "🟢 Healthy Project",
      data: {
        projectName: "NH-48 Nashik Bypass (Healthy Project)",
        state: "Maharashtra",
        district: "Nashik",
        projectType: "Highway",
        currentStage: "Compensation & Possession (Section 38)" as AcquisitionStage,
        totalLandRequired: 120,
        landAcquiredPercentage: 92,
        compensationPendingPercentage: 8,
        landPossessionPercentage: 88,
        pendingApprovals: 0,
        legalDisputes: 0,
        affectedFamilies: 35,
        rrCompletionPercentage: 95,
        previousDelay: false,
        environmentClearance: "Approved",
        forestClearance: "Approved",
      },
    },
    {
      id: "high_risk",
      label: "🔴 High-Risk Project",
      data: {
        projectName: "NH-48 Nashik Bypass Expansion",
        state: "Maharashtra",
        district: "Nashik",
        projectType: "Highway",
        currentStage: "Declaration (Section 19)" as AcquisitionStage,
        totalLandRequired: 185,
        landAcquiredPercentage: 42,
        compensationPendingPercentage: 80,
        landPossessionPercentage: 28,
        pendingApprovals: 7,
        legalDisputes: 6,
        affectedFamilies: 420,
        rrCompletionPercentage: 24,
        previousDelay: true,
        environmentClearance: "Pending",
        forestClearance: "Pending",
      },
    },
  ];

  function handleScenarioChange(scenarioId: string) {
    setSelectedScenario(scenarioId);
    const found = SCENARIOS.find((s) => s.id === scenarioId);
    if (found) {
      setForm((f) => ({
        ...f,
        ...found.data,
      }));
      setFormErrors({});
    }
  }

  // Available districts based on selected state
  const availableDistricts = useMemo(() => {
    return getDistrictsForState(form.state || "");
  }, [form.state]);

  function set(key: keyof PredictionRequest, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((errs) => {
        const copy = { ...errs };
        delete copy[key];
        return copy;
      });
    }
  }

  // Handle Percentage helper (clamped 0 to 100)
  function handlePercentageChange(key: keyof PredictionRequest, rawVal: string) {
    if (rawVal === "") {
      set(key, undefined);
      return;
    }
    const val = parseFloat(rawVal);
    if (isNaN(val)) return;
    const clamped = Math.min(100, Math.max(0, val));
    set(key, clamped);
  }

  // Handle Non-negative numbers helper
  function handleCountChange(key: keyof PredictionRequest, rawVal: string) {
    if (rawVal === "") {
      set(key, undefined);
      return;
    }
    const val = parseInt(rawVal, 10);
    if (isNaN(val)) return;
    set(key, Math.max(0, val));
  }

  // Handle Float numbers helper
  function handleFloatChange(key: keyof PredictionRequest, rawVal: string) {
    if (rawVal === "") {
      set(key, undefined);
      return;
    }
    const val = parseFloat(rawVal);
    if (isNaN(val)) return;
    set(key, Math.max(0, val));
  }

  // Dynamic State -> District Handler
  const handleStateChange = (newState: string) => {
    const districts = getDistrictsForState(newState);
    setForm((f) => ({
      ...f,
      state: newState,
      district: districts.length > 0 ? districts[0] : "",
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setFormErrors({});

    // Inline Validation
    const errors: Record<string, string> = {};
    if (!form.state) errors.state = "State selection is required";
    if (!form.district) errors.district = "District selection is required";
    if (!form.projectType) errors.projectType = "Project type is required";
    if (!form.currentStage) errors.currentStage = "Acquisition stage is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setLoading(true);
    setActiveStep(0);

    const stepInterval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < PROCESSING_STEPS.length - 1) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 250);

    try {
      const payload: PredictionRequest = {
        ...(form as PredictionRequest),
        siaStartDate: stageStartDate,
        preliminaryNotificationDate: stageStartDate,
        declarationDate: stageStartDate,
        awardDate: stageStartDate,
      };

      const res = await predictRisk(payload);
      setTimeout(() => {
        setResult(res);
        setLoading(false);
        clearInterval(stepInterval);
      }, 1000);
    } catch {
      clearInterval(stepInterval);
      setServerError("Prediction server unavailable. Ensure FastAPI backend is active.");
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setServerError(null);
    setFormErrors({});
    setStageStartDate("2026-08-10");
    setSelectedScenario("");
    setForm({
      projectName: "",
      state: "Maharashtra",
      district: "Nashik",
      projectType: "Highway",
      totalLandRequired: 100,
      landAcquiredPercentage: 40,
      landPossessionPercentage: 25,
      pendingApprovals: 3,
      compensationPendingPercentage: 50,
      legalDisputes: 1,
      ownershipDisputes: 0,
      affectedFamilies: 40,
      displacedFamilies: 10,
      rrCompletionPercentage: 50,
      environmentClearance: "Approved",
      forestClearance: "Pending",
      previousDelay: false,
      currentStage: "Preliminary Notification (Section 11)" as AcquisitionStage,
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white border border-[#e6eaf0] rounded-2xl shadow-sm overflow-hidden">
        {/* Form Title Banner */}
        <div className="px-6 py-4 border-b border-[#e6eaf0] bg-[#f8fafc] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#172033]">Land Acquisition Risk Form</h2>
            <p className="text-[11px] text-[#687386] mt-0.5">
              Enter acquisition parameters to run XGBoost risk modeling &amp; RFCTLARR stage evaluation
            </p>
          </div>
          <span
            className={`text-[10px] rounded-md px-3 py-1 font-bold border ${
              USE_MOCK ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {USE_MOCK ? "Simulation Mode" : "FastAPI ML Backend Live"}
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* SECTION 1: PROJECT DETAILS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#e6eaf0] pb-2">
              <Building2 size={18} className="text-[#2457d6]" />
              <h3 className="text-[13px] font-extrabold text-[#172033] uppercase tracking-wider">
                1. Project Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Project Name" hint="e.g. NH-48 Nashik Bypass">
                <input
                  className={inputCls}
                  placeholder="e.g. NH-48 Highway Expansion"
                  value={form.projectName ?? ""}
                  onChange={(e) => set("projectName", e.target.value)}
                />
              </Field>

              {/* Dynamic State Select */}
              <Field label="State" required error={formErrors.state}>
                <select
                  className={selectCls}
                  value={form.state ?? ""}
                  onChange={(e) => handleStateChange(e.target.value)}
                >
                  <option value="">Select State</option>
                  {ALL_INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Dynamic Cascading District Select */}
              <Field label="District" required error={formErrors.district} hint="Resets when State changes">
                <select
                  className={selectCls}
                  value={form.district ?? ""}
                  onChange={(e) => set("district", e.target.value)}
                >
                  {availableDistricts.map((dst) => (
                    <option key={dst} value={dst}>
                      {dst}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Project Type */}
              <Field label="Project Type" required error={formErrors.projectType}>
                <select
                  className={selectCls}
                  value={form.projectType ?? ""}
                  onChange={(e) => set("projectType", e.target.value)}
                >
                  <option value="">Select Type</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* SECTION 2: LAND PROGRESS */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b border-[#e6eaf0] pb-2">
              <PieChart size={18} className="text-[#2457d6]" />
              <h3 className="text-[13px] font-extrabold text-[#172033] uppercase tracking-wider">
                2. Land Progress Metrics
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Total Land Required (ha)" hint="Total hectares required">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={inputCls}
                  placeholder="e.g. 75"
                  value={form.totalLandRequired ?? ""}
                  onChange={(e) => handleFloatChange("totalLandRequired", e.target.value)}
                />
              </Field>

              <Field label="Land Acquired (%)" hint="Range: 0% to 100%">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  placeholder="e.g. 45"
                  value={form.landAcquiredPercentage ?? ""}
                  onChange={(e) => handlePercentageChange("landAcquiredPercentage", e.target.value)}
                />
              </Field>

              <Field label="Compensation Pending (%)" hint="Range: 0% to 100%">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  placeholder="e.g. 55"
                  value={form.compensationPendingPercentage ?? ""}
                  onChange={(e) => handlePercentageChange("compensationPendingPercentage", e.target.value)}
                />
              </Field>

              <Field label="Possession (%)" hint="Physical land possession">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  placeholder="e.g. 30"
                  value={form.landPossessionPercentage ?? ""}
                  onChange={(e) => handlePercentageChange("landPossessionPercentage", e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* SECTION 3: RISK FACTORS & STAGE TRACKER */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b border-[#e6eaf0] pb-2">
              <AlertTriangle size={18} className="text-[#2457d6]" />
              <h3 className="text-[13px] font-extrabold text-[#172033] uppercase tracking-wider">
                3. Risk Factors &amp; Acquisition Stage
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Legal Cases / Court Stays" hint="Active court disputes">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  placeholder="e.g. 2"
                  value={form.legalDisputes ?? ""}
                  onChange={(e) => handleCountChange("legalDisputes", e.target.value)}
                />
              </Field>

              <Field label="Pending Approvals" hint="Clearance bottlenecks">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  placeholder="e.g. 4"
                  value={form.pendingApprovals ?? ""}
                  onChange={(e) => handleCountChange("pendingApprovals", e.target.value)}
                />
              </Field>

              <Field label="Environmental Clearance">
                <select
                  className={selectCls}
                  value={form.environmentClearance ?? ""}
                  onChange={(e) => set("environmentClearance", e.target.value)}
                >
                  {CLEARANCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Forest Clearance">
                <select
                  className={selectCls}
                  value={form.forestClearance ?? ""}
                  onChange={(e) => set("forestClearance", e.target.value)}
                >
                  {CLEARANCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* RFCTLARR Stage Selector + Stage Start Date */}
            <div className="p-4 bg-[#f8fafc] border border-[#e6eaf0] rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Current Acquisition Stage" required error={formErrors.currentStage}>
                <select
                  className={`${selectCls} font-bold text-[#2457d6] border-[#2457d6]/40`}
                  value={form.currentStage ?? ""}
                  onChange={(e) => set("currentStage", e.target.value as AcquisitionStage)}
                >
                  {RFCTLARR_STAGES.map((st, idx) => (
                    <option key={st} value={st}>
                      {idx + 1}. {st}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Stage Start Date" hint="Date stage commenced">
                <input
                  type="date"
                  className={inputCls}
                  value={stageStartDate}
                  onChange={(e) => setStageStartDate(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* SECTION 4: ADVANCED PREDICTION PARAMETERS */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b border-[#e6eaf0] pb-2">
              <SlidersHorizontal size={18} className="text-[#2457d6]" />
              <h3 className="text-[13px] font-extrabold text-[#172033] uppercase tracking-wider">
                4. Advanced Prediction Parameters
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Affected Families" hint="Project affected families (PAFs)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  placeholder="e.g. 50"
                  value={form.affectedFamilies ?? ""}
                  onChange={(e) => handleCountChange("affectedFamilies", e.target.value)}
                />
              </Field>

              <Field label="R&R Completion (%)" hint="Range: 0% to 100%">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  placeholder="e.g. 40"
                  value={form.rrCompletionPercentage ?? ""}
                  onChange={(e) => handlePercentageChange("rrCompletionPercentage", e.target.value)}
                />
              </Field>

              <Field label="Previous Delay History" hint="Prior project delay record">
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#172033] cursor-pointer">
                    <input
                      type="radio"
                      name="previousDelay"
                      checked={form.previousDelay === false}
                      onChange={() => set("previousDelay", false)}
                      className="text-[#2457d6] focus:ring-[#2457d6]"
                    />
                    No Previous Delay
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#172033] cursor-pointer">
                    <input
                      type="radio"
                      name="previousDelay"
                      checked={form.previousDelay === true}
                      onChange={() => set("previousDelay", true)}
                      className="text-[#2457d6] focus:ring-[#2457d6]"
                    />
                    Delayed Earlier
                  </label>
                </div>
              </Field>
            </div>
          </div>

          {/* PROJECT SCENARIO */}
          <div className="pt-2">
            <div className="p-4 bg-[#f8fafc] border border-[#e6eaf0] rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-[13px] font-extrabold text-[#172033] flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#2457d6]" />
                  Project Scenario
                </h4>
                <p className="text-[11px] text-[#687386] mt-0.5">
                  Prefill the form with realistic project scenarios.
                </p>
              </div>
              <div className="w-full sm:w-auto min-w-[280px]">
                <select
                  className={selectCls}
                  value={selectedScenario}
                  onChange={(e) => handleScenarioChange(e.target.value)}
                >
                  <option value="">Select Scenario...</option>
                  {SCENARIOS.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Server Error Message */}
        {serverError && (
          <div className="mx-6 mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700 font-semibold">
            {serverError}
          </div>
        )}

        {/* SECTION 4: GENERATE PREDICTION */}
        <div className="px-6 py-4 border-t border-[#e6eaf0] bg-[#f8fafc] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-7 py-3 bg-[#2457d6] text-white text-[13px] font-extrabold rounded-xl hover:bg-[#173f9f] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-md hover:shadow-lg"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "Calculating ML Risk…" : "Generate Delay Prediction"}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-3 text-[12px] font-bold text-[#687386] hover:text-[#172033] transition-colors cursor-pointer"
            >
              Reset Form
            </button>
          </div>

          <p className="text-[11px] text-[#687386]">
            FastAPI Pipeline → XGBoost Model → SHAP Risk Engine
          </p>
        </div>
      </form>

      {/* Loading Modal */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#e6eaf0] rounded-2xl shadow-xl p-6 max-w-md w-full space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-[#eef3ff] text-[#2457d6] flex items-center justify-center mx-auto">
              <Loader2 size={24} className="animate-spin text-[#2457d6]" />
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-[#172033]">Evaluating Land Acquisition Risk</h3>
              <p className="text-[11px] text-[#687386] mt-0.5">
                Executing XGBoost model &amp; RFCTLARR stage progress evaluation…
              </p>
            </div>

            <div className="space-y-2 text-left pt-2 border-t border-[#e6eaf0]">
              {PROCESSING_STEPS.map((step, idx) => {
                const isFinished = idx < activeStep;
                const isCurrent = idx === activeStep;
                return (
                  <div key={step} className="flex items-center gap-3 text-[12px]">
                    {isFinished ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="animate-spin text-[#2457d6] shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                    )}
                    <span
                      className={`font-semibold ${
                        isFinished
                          ? "text-emerald-700 font-bold"
                          : isCurrent
                          ? "text-[#2457d6] font-extrabold"
                          : "text-gray-400"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Render Prediction Result Component */}
      {result && <PredictionResult result={result} onReset={handleReset} />}
    </div>
  );
}


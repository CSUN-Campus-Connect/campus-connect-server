"use client";

import * as React from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SearchIcon from "@mui/icons-material/Search";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import SchoolIcon from "@mui/icons-material/School";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ClassIcon from "@mui/icons-material/Class";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";

import type { UniCartClass } from "../shared/constants";
import {
  fetchSections,
  fetchSemesters,
  fetchDepartments,
  exportICSApi,
} from "../shared/academicsApi";
import { ClassSearchCard } from "./ClassSearchCard";
import { CartItem } from "./CartItem";
import { ScheduleGrid } from "./ScheduleGrid";
import { SearchTagPanel } from "./SearchTagPanel";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const LEVELS = ["All", "100s", "200s", "300s", "400s", "500s"];

function timesConflict(
  daysA: string[], startA: string, endA: string,
  daysB: string[], startB: string, endB: string
): boolean {
  const shared = daysA.filter(d => daysB.includes(d));
  if (!shared.length) return false;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return toMin(startA) < toMin(endB) && toMin(endA) > toMin(startB);
}

export default function UniCartClient() {
  // ── State ────────────────────────────────────────────────────────────────
  const [cartClasses, setCartClasses]     = React.useState<UniCartClass[]>([]);
  const [sections, setSections]           = React.useState<UniCartClass[]>([]);
  const [total, setTotal]                 = React.useState(0);
  const [loading, setLoading]             = React.useState(false);
  const [error, setError]                 = React.useState<string | null>(null);

  const [semesters, setSemesters]         = React.useState<string[]>([]);
  const [departments, setDepartments]     = React.useState<string[]>(["All"]);
  const [semester, setSemester]           = React.useState("Spring 2026");
  const [dept, setDept]                   = React.useState("All");
  const [level, setLevel]                 = React.useState("All");
  const [searchQuery, setSearchQuery]     = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [activeTag, setActiveTag]         = React.useState("All");
  const [filterDays, setFilterDays]       = React.useState<string[]>([]);
  const [openOnly, setOpenOnly]           = React.useState(false);
  const [sortUnits, setSortUnits]         = React.useState<"asc" | "desc" | null>(null);

  const [conflictError, setConflictError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg]       = React.useState<string | null>(null);
  const [exporting, setExporting]         = React.useState(false);

  // ── Debounce search ──────────────────────────────────────────────────────
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Load semesters + departments once ────────────────────────────────────
  React.useEffect(() => {
    fetchSemesters()
      .then(s => { setSemesters(s); if (s.length) setSemester(s[0]); })
      .catch(() => setSemesters(["Spring 2026", "Fall 2026", "Summer 2026"]));

    fetchDepartments()
      .then(d => setDepartments(d))
      .catch(() => {});
  }, []);

  // ── Fetch sections whenever filters change ───────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSections({
      semester,
      dept,
      search: debouncedSearch || undefined,
      level:  level !== "All" ? level : undefined,
      days:   filterDays.length ? filterDays : undefined,
      openOnly,
      tag:    activeTag !== "All" ? activeTag : undefined,
      limit:  100,
    })
      .then(({ sections: s, total: t }) => {
        if (cancelled) return;
        // Client-side unit sort
        let sorted = [...s];
        if (sortUnits === "asc")  sorted.sort((a, b) => a.units - b.units);
        if (sortUnits === "desc") sorted.sort((a, b) => b.units - a.units);
        setSections(sorted);
        setTotal(t);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message ?? "Failed to load sections");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [semester, dept, debouncedSearch, level, filterDays, openOnly, activeTag, sortUnits]);

  // ── Conflict detection ───────────────────────────────────────────────────
  const getConflicts = React.useCallback((cls: UniCartClass): string[] => {
    if (cls.isOnline || !cls.startTime) return [];
    return cartClasses
      .filter(c => c.id !== cls.id && !c.isOnline && c.startTime)
      .filter(c => timesConflict(
        cls.days ?? [], cls.startTime, cls.endTime,
        c.days ?? [], c.startTime, c.endTime
      ))
      .map(c => `${c.subject} ${c.number}`);
  }, [cartClasses]);

  const handleAddToCart = (cls: UniCartClass) => {
    const conflicts = getConflicts(cls);
    if (conflicts.length > 0) {
      setConflictError(`Cannot add ${cls.subject} ${cls.number}: conflict with ${conflicts.join(", ")}`);
      return;
    }
    if (cartClasses.some(c => c.id === cls.id)) return;
    setCartClasses(prev => [...prev, cls]);
    setSuccessMsg(`${cls.subject} ${cls.number} added to cart`);
  };

  // ── Export ICS ───────────────────────────────────────────────────────────
  const handleExportICS = async () => {
    if (!cartClasses.length) return;
    setExporting(true);
    try {
      const blob = await exportICSApi(cartClasses, semester);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${semester.replace(/\s+/g, "_")}_schedule.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg("Calendar exported!");
    } catch {
      setConflictError("Export failed. Is the backend running?");
    } finally {
      setExporting(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const totalUnits        = cartClasses.reduce((s, c) => s + c.units, 0);
  const totalMaterialCost = cartClasses.reduce((s, c) => s + (c.materialCost ?? 0), 0);
  const onlineCount       = cartClasses.filter(c => c.isOnline).length;

  return (
    <Box sx={{ minHeight: "100vh", background: "linear-gradient(160deg, #8b0000 0%, #A80532 35%, #c0182a 60%, #6b0f2a 100%)" }}>

      {/* Back button */}
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 2.5 }}>
        <Button
          component={Link} href="/academics"
          variant="outlined"
          startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 14 }} />}
          size="small"
          sx={{ color: "rgba(255,255,255,0.80)", borderColor: "rgba(255,255,255,0.25)", fontWeight: 700, borderRadius: 999, fontSize: "0.78rem", px: 1.75, py: 0.4, bgcolor: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", "&:hover": { bgcolor: "rgba(255,255,255,0.15)" } }}
        >
          Academics
        </Button>
      </Box>

      {/* Header */}
      <Box sx={{ pt: 1.5, pb: 0 }}>
        <Container>
          <Paper elevation={0} sx={{ borderRadius: "20px", p: { xs: 2.5, md: 3 }, mb: 0, bgcolor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(24px)" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
              <Box>
                <Typography sx={{ letterSpacing: 4, fontWeight: 900, color: "rgba(255,255,255,0.50)", fontSize: "0.58rem", textTransform: "uppercase", mb: 0.5 }}>
                  CSUN · COURSE ENROLLMENT
                </Typography>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.75 }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: "10px", bgcolor: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.20)" }}>
                    <ShoppingCartIcon sx={{ color: "#fff", fontSize: 20 }} />
                  </Box>
                  <Typography fontWeight={900} sx={{ fontSize: { xs: "1.5rem", md: "1.9rem" }, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
                    UniCart
                  </Typography>
                </Stack>
                <Typography sx={{ color: "rgba(255,255,255,0.60)", fontSize: "0.84rem", lineHeight: 1.5 }}>
                  Plan your semester. Search classes, detect conflicts, export your schedule.
                </Typography>
              </Box>

              {/* Semester selector */}
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={semester}
                  onChange={e => { setSemester(e.target.value); setCartClasses([]); }}
                  sx={{ borderRadius: "10px", fontWeight: 800, fontSize: "0.82rem", color: "#fff", bgcolor: "rgba(255,255,255,0.12)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.25)" }, "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.50)" }, "& .MuiSvgIcon-root": { color: "#fff" } }}
                >
                  {(semesters.length ? semesters : ["Spring 2026","Fall 2026","Summer 2026"]).map(s => (
                    <MenuItem key={s} value={s} sx={{ fontWeight: 700, fontSize: "0.82rem" }}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Paper>
        </Container>
      </Box>

      {/* Main */}
      <Container sx={{ pt: 2.5, pb: 6 }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 360px" }, alignItems: "start" }}>

          {/* LEFT: Class Library */}
          <Paper elevation={0} sx={{ borderRadius: "18px", overflow: "hidden", bgcolor: "rgba(255,255,255,0.97)", border: "1px solid rgba(255,255,255,0.60)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            {/* Panel header */}
            <Box sx={{ px: 2.25, py: 1.75, borderBottom: "1px solid rgba(0,0,0,0.06)", background: "linear-gradient(135deg,rgba(168,5,50,0.04),rgba(168,5,50,0.02))" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <ClassIcon sx={{ fontSize: 18, color: "#A80532" }} />
                  <Typography fontWeight={900} sx={{ fontSize: "1rem", color: "#1a1a2e" }}>Class Search Library</Typography>
                </Stack>
                <Typography sx={{ fontSize: "0.72rem", color: "rgba(0,0,0,0.40)", fontWeight: 600 }}>
                  {loading ? "Loading…" : `${total} sections · ${semester}`}
                </Typography>
              </Stack>
            </Box>

            <Box sx={{ p: 2.25 }}>
              {/* Search */}
              <TextField
                fullWidth size="small"
                placeholder="Search by course, title, or professor…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: "rgba(0,0,0,0.35)" }} /></InputAdornment> }}
                sx={{ mb: 1.5, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.84rem", "& fieldset": { borderColor: "rgba(0,0,0,0.12)" }, "&:hover fieldset": { borderColor: "rgba(168,5,50,0.30)" }, "&.Mui-focused fieldset": { borderColor: "#A80532" } } }}
              />

              {/* Filter row */}
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                {/* Department */}
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <Select value={dept} onChange={e => setDept(e.target.value)} sx={{ fontSize: "0.78rem", borderRadius: "8px" }}>
                    {departments.map(d => <MenuItem key={d} value={d} sx={{ fontSize: "0.78rem" }}>{d}</MenuItem>)}
                  </Select>
                </FormControl>

                {/* Level */}
                <FormControl size="small" sx={{ minWidth: 90 }}>
                  <Select value={level} onChange={e => setLevel(e.target.value)} sx={{ fontSize: "0.78rem", borderRadius: "8px" }}>
                    {LEVELS.map(l => <MenuItem key={l} value={l} sx={{ fontSize: "0.78rem" }}>{l === "All" ? "All Levels" : l}</MenuItem>)}
                  </Select>
                </FormControl>

                {/* Units sort */}
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <Select value={sortUnits ?? "none"} onChange={e => setSortUnits(e.target.value === "none" ? null : e.target.value as "asc" | "desc")} sx={{ fontSize: "0.78rem", borderRadius: "8px" }}>
                    <MenuItem value="none" sx={{ fontSize: "0.78rem" }}>Units: Default</MenuItem>
                    <MenuItem value="asc"  sx={{ fontSize: "0.78rem" }}>Units: Low→High</MenuItem>
                    <MenuItem value="desc" sx={{ fontSize: "0.78rem" }}>Units: High→Low</MenuItem>
                  </Select>
                </FormControl>

                {/* Open seats toggle */}
                <Chip
                  label="Open Seats"
                  size="small"
                  clickable
                  onClick={() => setOpenOnly(p => !p)}
                  sx={{ height: 32, fontWeight: 800, fontSize: "0.72rem", bgcolor: openOnly ? "#A80532" : "rgba(0,0,0,0.06)", color: openOnly ? "#fff" : "rgba(0,0,0,0.60)", "&:hover": { bgcolor: openOnly ? "#810326" : "rgba(0,0,0,0.10)" } }}
                />
              </Stack>

              {/* Day filter */}
              <ToggleButtonGroup
                value={filterDays}
                onChange={(_, v) => setFilterDays(v)}
                size="small"
                sx={{ mb: 1.5, "& .MuiToggleButton-root": { fontSize: "0.68rem", fontWeight: 800, px: 1, py: 0.4, borderRadius: "6px !important", border: "1px solid rgba(0,0,0,0.12) !important", mr: 0.5, "&.Mui-selected": { bgcolor: "#A80532", color: "#fff", "&:hover": { bgcolor: "#810326" } } } }}
              >
                {DAYS_OF_WEEK.map(d => <ToggleButton key={d} value={d}>{d}</ToggleButton>)}
              </ToggleButtonGroup>

              {/* Tag panel */}
              <Box sx={{ mb: 1.75 }}>
                <SearchTagPanel activeTag={activeTag} onTagChange={setActiveTag} />
              </Box>

              {/* Results */}
              {loading ? (
                <Box sx={{ textAlign: "center", py: 5 }}>
                  <CircularProgress size={28} sx={{ color: "#A80532" }} />
                  <Typography sx={{ mt: 1.5, fontSize: "0.82rem", color: "rgba(0,0,0,0.45)" }}>Loading sections…</Typography>
                </Box>
              ) : error ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography sx={{ color: "#dc2626", fontWeight: 800, fontSize: "0.88rem", mb: 0.5 }}>Failed to load sections</Typography>
                  <Typography sx={{ color: "rgba(0,0,0,0.45)", fontSize: "0.78rem", mb: 1.5 }}>{error}</Typography>
                  <Button size="small" startIcon={<RefreshIcon />} onClick={() => setSemester(s => s)} sx={{ color: "#A80532", fontWeight: 800, textTransform: "none" }}>Retry</Button>
                </Box>
              ) : sections.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <SearchIcon sx={{ fontSize: 36, color: "rgba(0,0,0,0.15)", mb: 1 }} />
                  <Typography sx={{ color: "rgba(0,0,0,0.45)", fontSize: "0.90rem", fontWeight: 700 }}>No sections match your filters.</Typography>
                </Box>
              ) : (
                <Stack spacing={1.25}>
                  {sections.map(cls => (
                    <ClassSearchCard
                      key={cls.id}
                      cls={cls}
                      onAdd={() => handleAddToCart(cls)}
                      inCart={cartClasses.some(c => c.id === cls.id)}
                      conflictsWith={getConflicts(cls)}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>

          {/* RIGHT: Cart + Schedule */}
          <Stack spacing={2}>
            {/* Cart */}
            <Paper elevation={0} sx={{ borderRadius: "18px", overflow: "hidden", bgcolor: "rgba(255,255,255,0.97)", border: "1px solid rgba(255,255,255,0.60)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
              <Box sx={{ px: 2.25, py: 1.75, borderBottom: "1px solid rgba(0,0,0,0.06)", background: "linear-gradient(135deg,rgba(168,5,50,0.05),rgba(168,5,50,0.02))" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ShoppingCartIcon sx={{ fontSize: 16, color: "#A80532" }} />
                    <Typography fontWeight={900} sx={{ fontSize: "0.95rem", color: "#1a1a2e" }}>My Cart — {semester}</Typography>
                  </Stack>
                  {cartClasses.length > 0 && (
                    <Button variant="text" size="small" onClick={() => setCartClasses([])}
                      sx={{ color: "rgba(0,0,0,0.35)", fontWeight: 800, fontSize: "0.72rem", textTransform: "none", "&:hover": { color: "#dc2626" } }}>
                      Clear all
                    </Button>
                  )}
                </Stack>
              </Box>

              <Box sx={{ p: 2 }}>
                {/* Stats */}
                {cartClasses.length > 0 && (
                  <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${totalMaterialCost > 0 ? 4 : 3}, 1fr)`, gap: 1, mb: 1.75, p: 1.25, borderRadius: "12px", bgcolor: "rgba(168,5,50,0.04)", border: "1.5px solid rgba(168,5,50,0.10)" }}>
                    {[
                      { icon: <ClassIcon sx={{ fontSize: 14, color: "#A80532" }} />, value: cartClasses.length, label: "Courses" },
                      { icon: <SchoolIcon sx={{ fontSize: 14, color: "#A80532" }} />, value: totalUnits, label: "Units" },
                      { icon: <CalendarTodayIcon sx={{ fontSize: 14, color: "#2563eb" }} />, value: onlineCount, label: "Online" },
                      ...(totalMaterialCost > 0 ? [{ icon: <AttachMoneyIcon sx={{ fontSize: 14, color: "#d97706" }} />, value: `~$${totalMaterialCost}`, label: "Materials" }] : []),
                    ].map(s => (
                      <Box key={s.label} sx={{ textAlign: "center" }}>
                        <Box sx={{ display: "flex", justifyContent: "center", mb: 0.25 }}>{s.icon}</Box>
                        <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>{s.value}</Typography>
                        <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, color: "rgba(0,0,0,0.42)", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Cart items */}
                {cartClasses.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 3 }}>
                    <ShoppingCartIcon sx={{ fontSize: 32, color: "rgba(0,0,0,0.12)", mb: 1 }} />
                    <Typography sx={{ color: "rgba(0,0,0,0.40)", fontSize: "0.85rem", fontStyle: "italic" }}>Your cart is empty.</Typography>
                    <Typography sx={{ color: "rgba(0,0,0,0.28)", fontSize: "0.75rem", mt: 0.25 }}>Search and add classes on the left.</Typography>
                  </Box>
                ) : (
                  <Stack spacing={0.75}>
                    {cartClasses.map((cls, idx) => (
                      <CartItem key={cls.id} cls={cls} index={idx} onRemove={() => setCartClasses(prev => prev.filter(c => c.id !== cls.id))} />
                    ))}
                  </Stack>
                )}

                {/* Export ICS */}
                {cartClasses.length > 0 && (
                  <Button
                    fullWidth variant="contained" size="small"
                    startIcon={exporting ? <CircularProgress size={12} sx={{ color: "#fff" }} /> : <DownloadIcon sx={{ fontSize: 14 }} />}
                    onClick={handleExportICS}
                    disabled={exporting}
                    sx={{ mt: 1.5, bgcolor: "#A80532", "&:hover": { bgcolor: "#810326" }, fontWeight: 900, borderRadius: "10px", textTransform: "none", fontSize: "0.80rem", boxShadow: "0 2px 8px rgba(168,5,50,0.30)" }}
                  >
                    Export to Calendar (.ics)
                  </Button>
                )}
              </Box>
            </Paper>

            {/* Schedule grid */}
            <Paper elevation={0} sx={{ borderRadius: "18px", overflow: "hidden", bgcolor: "rgba(255,255,255,0.97)", border: "1px solid rgba(255,255,255,0.60)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
              <Box sx={{ px: 2.25, py: 1.75, borderBottom: "1px solid rgba(0,0,0,0.06)", background: "linear-gradient(135deg,rgba(168,5,50,0.04),rgba(168,5,50,0.02))" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarTodayIcon sx={{ fontSize: 16, color: "#A80532" }} />
                    <Typography fontWeight={900} sx={{ fontSize: "0.95rem", color: "#1a1a2e" }}>Weekly Schedule</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: "0.68rem", color: "rgba(0,0,0,0.38)", fontWeight: 600 }}>
                    {cartClasses.filter(c => !c.isOnline && c.startTime).length} in-person
                  </Typography>
                </Stack>
              </Box>

              <Box sx={{ p: 2 }}>
                {cartClasses.filter(c => !c.isOnline && c.startTime).length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 3 }}>
                    <CalendarTodayIcon sx={{ fontSize: 28, color: "rgba(0,0,0,0.10)", mb: 1 }} />
                    <Typography sx={{ color: "rgba(0,0,0,0.38)", fontSize: "0.82rem", fontStyle: "italic" }}>No in-person classes added yet.</Typography>
                  </Box>
                ) : (
                  <ScheduleGrid classes={cartClasses} />
                )}
              </Box>
            </Paper>
          </Stack>
        </Box>
      </Container>

      {/* Toasts */}
      <Snackbar open={!!conflictError} autoHideDuration={4000} onClose={() => setConflictError(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="error" onClose={() => setConflictError(null)} sx={{ borderRadius: "12px", fontWeight: 700 }}>{conflictError}</Alert>
      </Snackbar>
      <Snackbar open={!!successMsg} autoHideDuration={2500} onClose={() => setSuccessMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ borderRadius: "12px", fontWeight: 700 }}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
}

"use client";

import * as React from "react";
import { Box, Button, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ComputerIcon from "@mui/icons-material/Computer";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ScienceIcon from "@mui/icons-material/Science";
import StarIcon from "@mui/icons-material/Star";
import type { UniCartClass } from "../shared/constants";
import { fmt12 } from "../shared/utils";
import { rmpUrl } from "./constants";

type Props = {
  cls: UniCartClass;
  onAdd: () => void;
  inCart: boolean;
  conflictsWith: string[];
};

export function ClassSearchCard({ cls, onAdd, inCart, conflictsWith }: Props) {
  const hasConflict = conflictsWith.length > 0;
  const isFull      = (cls.seatsAvailable ?? 1) === 0;
  const seatColor   = isFull ? "#dc2626" : (cls.seatsAvailable ?? 99) <= 5 ? "#d97706" : "#16a34a";
  const seatLabel   = isFull ? "Full" : `${cls.seatsAvailable}/${cls.seats} seats`;

  const professorRmpUrl = cls.professor ? rmpUrl(cls.professor) : null;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "14px",
        p: 0,
        border: `1.5px solid ${hasConflict ? "#fecdd3" : inCart ? "#bbf7d0" : "rgba(0,0,0,0.07)"}`,
        bgcolor: hasConflict ? "#fff8f8" : inCart ? "#f6fef9" : "#fff",
        transition: "all 0.18s ease",
        overflow: "hidden",
        "&:hover": {
          boxShadow: hasConflict
            ? "0 4px 18px rgba(220,38,38,0.12)"
            : inCart
            ? "0 4px 18px rgba(22,163,74,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09)",
          borderColor: hasConflict ? "#fca5a5" : inCart ? "#86efac" : "rgba(168,5,50,0.20)",
          transform: "translateY(-1px)",
        },
      }}
    >
      {/* Top colored stripe */}
      <Box sx={{
        height: 3,
        background: hasConflict
          ? "linear-gradient(90deg, #dc2626, #fca5a5)"
          : inCart
          ? "linear-gradient(90deg, #16a34a, #86efac)"
          : "linear-gradient(90deg, #A80532, #c0182a)",
      }} />

      <Box sx={{ p: 1.75 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          {/* Left: course info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Code + badges row */}
            <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" sx={{ mb: 0.3 }}>
              <Typography sx={{ fontWeight: 900, fontSize: "0.88rem", color: "#A80532", letterSpacing: 0.3 }}>
                {cls.subject} {cls.number}
              </Typography>
              <Chip label={`${cls.units}u`} size="small" sx={{ height: 15, fontSize: "0.60rem", fontWeight: 900, bgcolor: "rgba(168,5,50,0.09)", color: "#A80532" }} />
              {cls.courseType && (
                <Chip label={cls.courseType} size="small" sx={{ height: 15, fontSize: "0.58rem", fontWeight: 700, bgcolor: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.55)" }} />
              )}
              {isFull && (
                <Chip label="Full" size="small" sx={{ height: 15, fontSize: "0.58rem", fontWeight: 900, bgcolor: "#fef2f2", color: "#dc2626" }} />
              )}
              {(cls.waitlistCount ?? 0) > 0 && !isFull && (
                <Chip label={`Wait: ${cls.waitlistCount}`} size="small" sx={{ height: 15, fontSize: "0.58rem", fontWeight: 700, bgcolor: "#fffbeb", color: "#d97706" }} />
              )}
            </Stack>

            {/* Title + professor */}
            <Typography fontWeight={800} sx={{ fontSize: "0.85rem", lineHeight: 1.25, color: "#1a1a2e", mb: 0.15 }}>
              {cls.title}
            </Typography>
            <Typography sx={{ fontSize: "0.76rem", color: "rgba(0,0,0,0.52)", mb: 0.6 }}>
              {cls.professor} · §{cls.sectionId}
            </Typography>

            {/* Schedule + location */}
            <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 0.5 }}>
              {cls.isOnline ? (
                <Stack direction="row" spacing={0.4} alignItems="center">
                  <ComputerIcon sx={{ fontSize: 12, color: "#2563eb" }} />
                  <Typography sx={{ fontSize: "0.72rem", color: "#2563eb", fontWeight: 700 }}>Online</Typography>
                </Stack>
              ) : cls.startTime ? (
                <Stack direction="row" spacing={0.4} alignItems="center">
                  <AccessTimeIcon sx={{ fontSize: 12, color: "rgba(0,0,0,0.40)" }} />
                  <Typography sx={{ fontSize: "0.72rem", color: "rgba(0,0,0,0.55)" }}>
                    {cls.days?.join("/")} · {fmt12(cls.startTime)}–{fmt12(cls.endTime)}
                  </Typography>
                </Stack>
              ) : null}
              {cls.location && !cls.isOnline && (
                <Stack direction="row" spacing={0.4} alignItems="center">
                  <LocationOnIcon sx={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }} />
                  <Typography sx={{ fontSize: "0.72rem", color: "rgba(0,0,0,0.50)" }}>{cls.location}</Typography>
                </Stack>
              )}
              {cls.materialCost !== undefined && (
                <Chip
                  label={cls.materialCost === 0 ? "No materials" : `~$${cls.materialCost} materials`}
                  size="small"
                  sx={{
                    height: 15, fontSize: "0.58rem", fontWeight: 700,
                    bgcolor: cls.materialCost === 0 ? "#f0fdf4" : "#fffbeb",
                    color:   cls.materialCost === 0 ? "#16a34a" : "#d97706",
                  }}
                />
              )}
            </Stack>

            {/* Prereqs + lab */}
            {(cls.prerequisites ?? []).length > 0 && (
              <Typography sx={{ fontSize: "0.68rem", color: "rgba(0,0,0,0.42)", mb: 0.2 }}>
                Prereqs: {cls.prerequisites!.join(", ")}
              </Typography>
            )}
            {cls.linkedLab && (
              <Stack direction="row" spacing={0.4} alignItems="center" sx={{ mb: 0.2 }}>
                <ScienceIcon sx={{ fontSize: 11, color: "#7c3aed" }} />
                <Typography sx={{ fontSize: "0.68rem", color: "#7c3aed", fontWeight: 700 }}>
                  Correlated lab required · §{cls.linkedLab}
                </Typography>
              </Stack>
            )}

            {/* Tags */}
            {(cls.tags ?? []).length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={0.35} sx={{ mt: 0.5 }}>
                {cls.tags!.map((t) => (
                  <Chip key={t} label={t} size="small" sx={{ height: 13, fontSize: "0.56rem", fontWeight: 700, bgcolor: "rgba(168,5,50,0.05)", color: "rgba(0,0,0,0.48)", "& .MuiChip-label": { px: 0.75 } }} />
                ))}
              </Stack>
            )}

            {/* Conflict warning */}
            {hasConflict && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75, p: "4px 8px", borderRadius: "6px", bgcolor: "#fef2f2", border: "1px solid #fecdd3" }}>
                <WarningAmberIcon sx={{ fontSize: 12, color: "#dc2626" }} />
                <Typography sx={{ fontSize: "0.68rem", color: "#dc2626", fontWeight: 800 }}>
                  Conflict with: {conflictsWith.join(", ")}
                </Typography>
              </Stack>
            )}
          </Box>

          {/* Right: actions */}
          <Stack spacing={0.75} alignItems="flex-end" sx={{ flexShrink: 0, minWidth: 72 }}>
            {/* Add / In Cart */}
            {inCart ? (
              <Stack direction="row" spacing={0.4} alignItems="center" sx={{ bgcolor: "#f0fdf4", borderRadius: "8px", px: 1, py: 0.4, border: "1px solid #bbf7d0" }}>
                <CheckCircleIcon sx={{ fontSize: 12, color: "#16a34a" }} />
                <Typography sx={{ fontSize: "0.68rem", fontWeight: 900, color: "#16a34a" }}>In Cart</Typography>
              </Stack>
            ) : (
              <Tooltip title={hasConflict ? "Time conflict" : isFull ? "Section full" : "Add to cart"}>
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: "11px !important" }} />}
                    onClick={onAdd}
                    disabled={hasConflict || inCart}
                    sx={{
                      bgcolor: "#A80532",
                      "&:hover": { bgcolor: "#810326" },
                      "&:disabled": { bgcolor: "rgba(0,0,0,0.10)", color: "rgba(0,0,0,0.35)" },
                      fontWeight: 900,
                      borderRadius: "8px",
                      fontSize: "0.72rem",
                      px: 1.25, py: 0.5,
                      boxShadow: "0 2px 8px rgba(168,5,50,0.30)",
                      textTransform: "none",
                    }}
                  >
                    + ADD
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* Seats */}
            <Typography sx={{ fontSize: "0.68rem", fontWeight: 900, color: seatColor, textAlign: "right" }}>
              {seatLabel}
            </Typography>

            {/* External links */}

            <Button
              variant="text" size="small"
              endIcon={<OpenInNewRoundedIcon sx={{ fontSize: "10px !important" }} />}
              onClick={() => window.open(professorRmpUrl ?? "https://www.ratemyprofessors.com", "_blank", "noopener,noreferrer")}
              sx={{ fontSize: "0.65rem", fontWeight: 800, color: "rgba(0,0,0,0.42)", minWidth: 0, p: "2px 4px", textTransform: "none", "&:hover": { color: "#2563eb" } }}
            >
              <Stack direction="row" spacing={0.3} alignItems="center">
                <StarIcon sx={{ fontSize: 9, color: "#f59e0b" }} />
                <span>RMP</span>
              </Stack>
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}

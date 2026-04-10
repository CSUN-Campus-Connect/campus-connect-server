"use client";

//mockup shopping cart for two table cross referencing (dont know if we have enough access to implement course data per semester or not)

import * as React from "react";
import { Box, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ComputerIcon from "@mui/icons-material/Computer";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ScienceIcon from "@mui/icons-material/Science";
import type { UniCartClass } from "../shared/constants";
import { fmt12 } from "../shared/utils";
import { SCHEDULE_PALETTE } from "./constants";

type Props = { cls: UniCartClass; index: number; onRemove: () => void };

export function CartItem({ cls, index, onRemove }: Props) {
  const color = SCHEDULE_PALETTE[index % SCHEDULE_PALETTE.length];

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "12px",
        p: 0,
        border: "1.5px solid rgba(0,0,0,0.07)",
        bgcolor: "#fff",
        overflow: "hidden",
        transition: "all 0.15s ease",
        "&:hover": { boxShadow: "0 2px 12px rgba(0,0,0,0.08)", borderColor: "rgba(0,0,0,0.12)" },
      }}
    >
      {/* Color accent left bar */}
      <Box sx={{ display: "flex" }}>
        <Box sx={{ width: 4, bgcolor: color, flexShrink: 0 }} />
        <Box sx={{ flex: 1, p: "10px 12px 10px 10px" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Code + units */}
              <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mb: 0.15 }}>
                <Typography sx={{ fontWeight: 900, fontSize: "0.82rem", color }}>
                  {cls.subject} {cls.number}
                </Typography>
                <Chip label={`${cls.units}u`} size="small" sx={{ height: 14, fontSize: "0.58rem", fontWeight: 900, bgcolor: color + "15", color }} />
                {cls.isOnline && (
                  <Chip label="Online" size="small" sx={{ height: 14, fontSize: "0.58rem", fontWeight: 700, bgcolor: "#eff6ff", color: "#2563eb" }} />
                )}
              </Stack>

              {/* Title */}
              <Typography fontWeight={700} sx={{ fontSize: "0.80rem", lineHeight: 1.2, color: "#1a1a2e", mb: 0.15 }}>
                {cls.title}
              </Typography>

              {/* Professor + section */}
              <Typography sx={{ fontSize: "0.70rem", color: "rgba(0,0,0,0.48)", mb: 0.25 }}>
                {cls.professor} · §{cls.sectionId}
              </Typography>

              {/* Schedule */}
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {cls.isOnline ? (
                  <Stack direction="row" spacing={0.35} alignItems="center">
                    <ComputerIcon sx={{ fontSize: 11, color: "#2563eb" }} />
                    <Typography sx={{ fontSize: "0.68rem", color: "#2563eb" }}>Async Online</Typography>
                  </Stack>
                ) : cls.startTime ? (
                  <>
                    <Stack direction="row" spacing={0.35} alignItems="center">
                      <AccessTimeIcon sx={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }} />
                      <Typography sx={{ fontSize: "0.68rem", color: "rgba(0,0,0,0.52)" }}>
                        {cls.days?.join("/")} · {fmt12(cls.startTime)}–{fmt12(cls.endTime)}
                      </Typography>
                    </Stack>
                    {cls.location && (
                      <Stack direction="row" spacing={0.35} alignItems="center">
                        <LocationOnIcon sx={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }} />
                        <Typography sx={{ fontSize: "0.68rem", color: "rgba(0,0,0,0.45)" }}>{cls.location}</Typography>
                      </Stack>
                    )}
                  </>
                ) : (
                  <Typography sx={{ fontSize: "0.68rem", color: "rgba(0,0,0,0.40)" }}>TBA</Typography>
                )}
              </Stack>

              {/* Material cost */}
              {(cls.materialCost ?? 0) > 0 && (
                <Typography sx={{ fontSize: "0.66rem", color: "#d97706", fontWeight: 700, mt: 0.25 }}>
                  ~${cls.materialCost} materials
                </Typography>
              )}

              {/* Prereqs */}
              {(cls.prerequisites ?? []).length > 0 && (
                <Typography sx={{ fontSize: "0.64rem", color: "rgba(0,0,0,0.38)", mt: 0.15 }}>
                  Prereqs: {cls.prerequisites!.join(", ")}
                </Typography>
              )}

              {/* Lab */}
              {cls.linkedLab && (
                <Stack direction="row" spacing={0.35} alignItems="center" sx={{ mt: 0.2 }}>
                  <ScienceIcon sx={{ fontSize: 10, color: "#7c3aed" }} />
                  <Typography sx={{ fontSize: "0.64rem", color: "#7c3aed", fontWeight: 700 }}>
                    Lab §{cls.linkedLab} required
                  </Typography>
                </Stack>
              )}
            </Box>

            {/* Remove button */}
            <IconButton
              size="small"
              onClick={onRemove}
              sx={{ color: "rgba(0,0,0,0.28)", "&:hover": { color: "#dc2626", bgcolor: "#fef2f2" }, p: 0.4, mt: -0.25, mr: -0.25, borderRadius: "8px" }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}

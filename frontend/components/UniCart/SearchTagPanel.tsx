"use client";

import * as React from "react";
import { Box, Chip, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { TAG_GROUPS } from "./constants";

type Props = {
  activeTag: string;
  onTagChange: (tag: string) => void;
};

export function SearchTagPanel({ activeTag, onTagChange }: Props) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Box>
      {/* "All" chip + expand toggle */}
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
        <Chip
          label="All"
          size="small"
          clickable
          onClick={() => onTagChange("All")}
          sx={{
            fontWeight: 900, fontSize: "0.70rem", height: 22,
            bgcolor: activeTag === "All" ? "#A80532" : "rgba(0,0,0,0.06)",
            color:   activeTag === "All" ? "#fff"    : "rgba(0,0,0,0.60)",
            "&:hover": { bgcolor: activeTag === "All" ? "#810326" : "rgba(0,0,0,0.10)" },
          }}
        />
        <Chip
          label={expanded ? "Fewer filters ▲" : "More filters ▼"}
          size="small"
          clickable
          onClick={() => setExpanded((p) => !p)}
          sx={{ fontWeight: 700, fontSize: "0.66rem", height: 20, bgcolor: "transparent", color: "rgba(0,0,0,0.45)", border: "1px solid rgba(0,0,0,0.12)", "&:hover": { bgcolor: "rgba(0,0,0,0.04)" } }}
        />
        {activeTag !== "All" && (
          <Chip
            label={`✕ ${activeTag}`}
            size="small"
            clickable
            onClick={() => onTagChange("All")}
            sx={{ fontWeight: 800, fontSize: "0.66rem", height: 20, bgcolor: "#fef2f2", color: "#A80532", border: "1px solid #fecdd3" }}
          />
        )}
      </Stack>

      {/* Quick common tags (always visible) */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 0.5 }}>
        {["COMP", "MATH", "ENGL", "ART", "BUS", "PHYS", "BIOL", "Online", "In-Person", "Upper Division", "Lower Division", "Open Seats"].map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            clickable
            onClick={() => onTagChange(tag)}
            sx={{
              fontWeight: 800, fontSize: "0.68rem", height: 20,
              bgcolor: activeTag === tag ? "#A80532" : "rgba(0,0,0,0.05)",
              color:   activeTag === tag ? "#fff"    : "rgba(0,0,0,0.58)",
              "&:hover": { bgcolor: activeTag === tag ? "#810326" : "rgba(0,0,0,0.09)" },
              transition: "all 0.12s",
            }}
          />
        ))}
      </Box>

      {/* Expanded grouped tags */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 0.75, p: 1.25, borderRadius: "10px", bgcolor: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <Stack spacing={0.75}>
            {TAG_GROUPS.map((group) => (
              <Box key={group.label}>
                <Typography sx={{ fontSize: "0.60rem", fontWeight: 900, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: 1, mb: 0.4 }}>
                  {group.label}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                  {group.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      clickable
                      onClick={() => onTagChange(tag)}
                      sx={{
                        fontWeight: 700, fontSize: "0.64rem", height: 18,
                        bgcolor: activeTag === tag ? "#A80532" : "rgba(0,0,0,0.05)",
                        color:   activeTag === tag ? "#fff"    : "rgba(0,0,0,0.55)",
                        "&:hover": { bgcolor: activeTag === tag ? "#810326" : "rgba(0,0,0,0.09)" },
                        "& .MuiChip-label": { px: 0.75 },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

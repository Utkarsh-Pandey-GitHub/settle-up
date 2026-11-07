import React, { useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { XStack, YStack } from "tamagui";
import { Button, Heading, Icon, IconButton, Label, useColors } from "./ui";

function formatPickerDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  label,
  value,
  onChange,
  clearable = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  clearable?: boolean;
}) {
  return <CalendarField {...{ label, value, onChange, clearable }} />;
}

function CalendarField({
  label,
  value,
  onChange,
  clearable = false,
  withTime = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  clearable?: boolean;
  withTime?: boolean;
}) {
  const c = useColors();
  const [selectedDate, selectedTime = "00:00"] = value.split(" ");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? new Date(`${selectedDate}T12:00:00`)
    : new Date();
  const parsed = Number.isNaN(date.getTime()) ? new Date() : date;
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(selectedDate);
  const [draftTime, setDraftTime] = useState(selectedTime);
  const [month, setMonth] = useState(
    new Date(parsed.getFullYear(), parsed.getMonth(), 1),
  );
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  const weeks = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - firstWeekday + 1;
      return day > 0 && day <= daysInMonth ? day : null;
    }),
  );
  const dateLabel = parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year:
      parsed.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value || "No date selected"}`}
        onPress={() => {
          Keyboard.dismiss();
          setMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
          setDraftDate(selectedDate || formatPickerDate(parsed));
          setDraftTime(selectedTime);
          setVisible(true);
        }}
        style={({ pressed }) => ({
          minHeight: 50,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: pressed ? c.soft : c.card,
          paddingHorizontal: 13,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        })}
      >
        {withTime ? (
          <Label flex={1} minWidth={0} size={14}>
            {value ? `${dateLabel} · ${selectedTime}` : "Choose date and time"}
          </Label>
        ) : (
          <YStack gap={2} flex={1} minWidth={0}>
            <Label muted size={10}>
              {label}
            </Label>
            <Label bold>{value || "Choose date"}</Label>
          </YStack>
        )}
        <Icon name="calendar" size={18} color={c.primary} />
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", padding: 14 }}>
          <Pressable
            accessible={false}
            onPress={() => setVisible(false)}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(20, 18, 25, 0.46)" },
            ]}
          />
          <ScrollView
            bounces={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{
              width: "100%",
              maxWidth: 328,
              maxHeight: "100%",
              flexGrow: 0,
              alignSelf: "center",
              borderRadius: 18,
              backgroundColor: c.card,
            }}
            contentContainerStyle={{
              padding: 12,
              gap: 8,
            }}
          >
            <XStack alignItems="center" justifyContent="space-between" gap={8}>
              <IconButton
                name="back"
                label="Previous month"
                borderless
                onPress={() =>
                  setMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
              />
              <Heading size={16} flex={1} minWidth={0} textAlign="center">
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </Heading>
              <IconButton
                name="arrow"
                label="Next month"
                borderless
                onPress={() =>
                  setMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
              />
            </XStack>
            <View>
              <View style={{ flexDirection: "row" }}>
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                  <View
                    key={day}
                    style={{ flex: 1, alignItems: "center", paddingBottom: 4 }}
                  >
                    <Label muted size={11} bold>
                      {day}
                    </Label>
                  </View>
                ))}
              </View>
              {weeks.map((week, index) => (
                <View key={index} style={{ flexDirection: "row" }}>
                  {week.map((day, weekday) => {
                    if (!day) return <View key={weekday} style={{ flex: 1 }} />;
                    const candidate = new Date(
                      month.getFullYear(),
                      month.getMonth(),
                      day,
                    );
                    const next = formatPickerDate(candidate);
                    const selected = next === draftDate;
                    return (
                      <Pressable
                        key={weekday}
                        accessibilityRole="button"
                        accessibilityLabel={candidate.toLocaleDateString(
                          "en-IN",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          if (withTime) setDraftDate(next);
                          else {
                            onChange(next);
                            setVisible(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          height: 38,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: "90%",
                            maxWidth: 34,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: selected
                              ? c.primary
                              : "transparent",
                          }}
                        >
                          <Label
                            size={13}
                            bold={selected}
                            color={selected ? c.onPrimary : c.text}
                          >
                            {day}
                          </Label>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            {withTime && (
              <>
                <Label bold size={13}>
                  Time · IST
                </Label>
                <XStack gap={10}>
                  <TimeColumn
                    label="Hour"
                    options={hours}
                    selected={draftTime.slice(0, 2)}
                    onChange={(hour) =>
                      setDraftTime((time) => `${hour}:${time.slice(3)}`)
                    }
                  />
                  <TimeColumn
                    label="Minute"
                    options={minutes}
                    selected={draftTime.slice(3)}
                    onChange={(minute) =>
                      setDraftTime((time) => `${time.slice(0, 2)}:${minute}`)
                    }
                  />
                </XStack>
                <Button
                  compact
                  onPress={() => {
                    onChange(`${draftDate} ${draftTime}`);
                    setVisible(false);
                  }}
                >
                  Done
                </Button>
              </>
            )}
            {clearable && !!value && (
              <Button
                compact
                secondary
                onPress={() => {
                  onChange("");
                  setVisible(false);
                }}
              >
                Clear date
              </Button>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const numberOptions = (count: number) =>
  Array.from({ length: count }, (_, i) => String(i).padStart(2, "0"));
const hours = numberOptions(24);
const minutes = numberOptions(60);
const timeRowHeight = 34;

function TimeColumn({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string;
  onChange(value: string): void;
}) {
  const c = useColors();
  const [initialOffset] = useState(() => ({
    x: 0,
    y:
      Math.min(options.length - 3, Math.max(0, options.indexOf(selected) - 1)) *
      timeRowHeight,
  }));
  return (
    <YStack flex={1} minWidth={0} gap={4}>
      <Label muted size={12}>
        {label}
      </Label>
      <ScrollView
        nestedScrollEnabled
        accessibilityLabel={label}
        contentOffset={initialOffset}
        style={{
          height: timeRowHeight * 3,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 10,
        }}
      >
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${option}`}
            accessibilityState={{ selected: option === selected }}
            onPress={() => onChange(option)}
            style={{
              height: timeRowHeight,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: option === selected ? c.primary : c.card,
            }}
          >
            <Label size={13} color={option === selected ? c.onPrimary : c.text}>
              {option}
            </Label>
          </Pressable>
        ))}
      </ScrollView>
    </YStack>
  );
}

export function DateTimePicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange(value: string): void;
  error?: string;
}) {
  return (
    <YStack gap={7}>
      <Label bold size={13}>
        Date and time
      </Label>
      <CalendarField
        label="Date and time (India time)"
        value={value}
        onChange={onChange}
        withTime
      />
      {!!error && <Label color="#A92332">{error}</Label>}
    </YStack>
  );
}

"use client";

import * as React from "react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRouter, useSearchParams } from "next/navigation";

export function DatePeriodFilter({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [date, setDate] = React.useState<DateRange | undefined>(() => {
    if (fromParam && toParam) {
      return {
        from: new Date(fromParam),
        to: new Date(toParam),
      };
    }
    // Default to last 30 days if no params
    return {
      from: subDays(new Date(), 30),
      to: new Date(),
    };
  });

  const updateUrl = (range: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (range?.from) {
      params.set("from", format(range.from, "yyyy-MM-dd"));
    } else {
      params.delete("from");
    }
    
    if (range?.to) {
      params.set("to", format(range.to, "yyyy-MM-dd"));
    } else {
      params.delete("to");
    }
    
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleSelect = (newDate: DateRange | undefined) => {
    setDate(newDate);
    if (newDate?.from && newDate?.to) {
      updateUrl(newDate);
    }
  };

  const setPreset = (preset: 'today' | 'month' | 'quarter' | 'year' | 'last30') => {
    let range: DateRange;
    const now = new Date();

    switch (preset) {
      case 'today':
        range = { from: startOfDay(now), to: endOfDay(now) };
        break;
      case 'month':
        range = { from: startOfMonth(now), to: endOfMonth(now) };
        break;
      case 'quarter':
        range = { from: startOfQuarter(now), to: endOfQuarter(now) };
        break;
      case 'year':
        range = { from: startOfYear(now), to: endOfYear(now) };
        break;
      case 'last30':
      default:
        range = { from: subDays(now, 30), to: now };
        break;
    }
    
    setDate(range);
    updateUrl(range);
  };

  // Fix typo in function names if they exist or just use the imported ones
  const startOfOfMonth = (d: Date) => startOfMonth(d);
  const endOfOfMonth = (d: Date) => endOfMonth(d);
  const startOfOfQuarter = (d: Date) => startOfQuarter(d);
  const endOfOfQuarter = (d: Date) => endOfQuarter(d);

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full sm:w-[280px] justify-start text-left font-normal bg-background/50 backdrop-blur-sm border-accent/20 h-10 sm:h-9",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-accent" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                  {format(date.to, "LLL dd, y", { locale: es })}
                </>
              ) : (
                format(date.from, "LLL dd, y", { locale: es })
              )
            ) : (
              <span>Seleccionar periodo</span>
            )}
            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-accent/20 shadow-2xl" align="end">
          <div className="flex flex-col sm:flex-row">
            <div className="p-3 border-b sm:border-b-0 sm:border-r border-accent/10 flex flex-col gap-2 min-w-[140px] bg-muted/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-2">Presets</p>
              <Button variant="ghost" size="sm" className="justify-start font-medium text-xs hover:bg-accent/10" onClick={() => setPreset('today')}>Hoy</Button>
              <Button variant="ghost" size="sm" className="justify-start font-medium text-xs hover:bg-accent/10" onClick={() => setPreset('month')}>Este Mes</Button>
              <Button variant="ghost" size="sm" className="justify-start font-medium text-xs hover:bg-accent/10" onClick={() => setPreset('quarter')}>Este Trimestre</Button>
              <Button variant="ghost" size="sm" className="justify-start font-medium text-xs hover:bg-accent/10" onClick={() => setPreset('year')}>Este Año</Button>
              <Button variant="ghost" size="sm" className="justify-start font-medium text-xs hover:bg-accent/10" onClick={() => setPreset('last30')}>Últimos 30 días</Button>
            </div>
            <div className="p-0">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={handleSelect}
                numberOfMonths={1}
                locale={es}
                className="bg-transparent"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

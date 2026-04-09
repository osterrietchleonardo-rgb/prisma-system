"use client";

import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Loader2, CheckCircle2, User } from "lucide-react";
import { parseWhatsAppChat, getChatParticipants } from "@/lib/tracking/waParser";
import { calculateQuantitativeMetrics } from "@/lib/tracking/waCalculations";
import { analyzeWA } from "@/actions/tracking/analyzeWA";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface Props {
  onDataCalculated: (quantitative: any, qualitative: any) => void;
  onAnalysisStatusChange: (isAnalyzing: boolean) => void;
}

export function WAUploader({ onDataCalculated, onAnalysisStatusChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [selectedAsesor, setSelectedAsesor] = useState<string>("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedMessages, setParsedMessages] = useState<any[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.name.endsWith(".txt")) {
      setFile(file);
      processFile(file);
    } else {
      toast.error("Por favor, subí un archivo .txt de WhatsApp");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/plain": [".txt"] },
    multiple: false,
  });

  const processFile = async (file: File) => {
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const messages = parseWhatsAppChat(text);
      if (messages.length === 0) {
        toast.error("No se detectaron mensajes válidos en el archivo.");
        setIsParsing(false);
        return;
      }
      const parts = getChatParticipants(messages);
      setParsedMessages(messages);
      setParticipants(parts);
      setIsParsing(false);
      
      if (parts.length === 2) {
        // Auto-select if there are only 2 (one is the lead, one is the asesor)
        // Usually we'd need some heuristic or let them pick.
      }
    };
    reader.readAsText(file);
  };

  const handleSelectAsesor = async (name: string) => {
    setSelectedAsesor(name);
    const quant = calculateQuantitativeMetrics(parsedMessages, name);
    
    // Inmediatamente avisar de las métricas cuantitativas
    onDataCalculated(quant, null);
    
    // Disparar análisis cualitativo en background
    onAnalysisStatusChange(true);
    try {
      const qual = await analyzeWA(parsedMessages, name);
      onDataCalculated(quant, qual);
      toast.success("Análisis de IA completado");
    } catch (err) {
      console.error(err);
      toast.error("Error en el análisis de IA, se guardará como pendiente.");
    } finally {
      onAnalysisStatusChange(false);
    }
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${
            isDragActive ? "border-accent bg-accent/5" : "border-muted-foreground/20 hover:border-accent/50"
          }`}
        >
          <input {...getInputProps()} />
          <FileText className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-center">
            Arrastrá el archivo .txt del chat aquí <br />
            o hacé click para buscarlo
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Solo archivos .txt exportados de WhatsApp
          </p>
        </div>
      ) : (
        <Card className="p-4 border-accent/20 bg-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setFile(null); setParticipants([]); setSelectedAsesor(""); }}>
              Cambiar
            </Button>
          </div>
        </Card>
      )}

      {participants.length > 0 && !selectedAsesor && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <p className="text-sm font-medium text-muted-foreground">¿Cuál de estos sos vos (el asesor)?</p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <Badge
                key={p}
                variant={selectedAsesor === p ? "default" : "outline"}
                className="cursor-pointer py-1.5 px-3 text-sm"
                onClick={() => handleSelectAsesor(p)}
              >
                <User className="w-3 h-3 mr-1" />
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {selectedAsesor && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          Asesor identificado: <span className="font-semibold text-foreground">{selectedAsesor}</span>
        </div>
      )}
    </div>
  );
}

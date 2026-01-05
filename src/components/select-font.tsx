import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { type FontFamily, useFontFamily } from "@/hooks/use-font-family"

/**
 * Font Selector Component
 * Can be integrated into settings panel, supports system font, Inter font, and custom fonts
 */
export function SelectFont() {
  const { fontFamily, customFont, updateFontFamily, updateCustomFont, presets } = useFontFamily()
  const [customValue, setCustomValue] = useState(customFont)

  const handleFontChange = (value: FontFamily) => {
    updateFontFamily(value)
  }

  const handleCustomFontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCustomValue(value)
  }

  const handleCustomFontBlur = () => {
    if (customValue.trim()) {
      updateCustomFont(customValue.trim())
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="font-select">Font Family</Label>
        <Select value={fontFamily} onValueChange={handleFontChange}>
          <SelectTrigger id="font-select">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <span className="font-normal">{presets.system.name}</span>
            </SelectItem>
            <SelectItem value="inter">
              <span className="font-normal">{presets.inter.name}</span>
            </SelectItem>
            <SelectItem value="custom">
              <span className="font-normal">{presets.custom.name}</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fontFamily === "custom" && (
        <div className="space-y-2">
          <Label htmlFor="custom-font">Custom Font Family</Label>
          <Input
            id="custom-font"
            type="text"
            placeholder='e.g., "Helvetica Neue", Arial, sans-serif'
            value={customValue}
            onChange={handleCustomFontChange}
            onBlur={handleCustomFontBlur}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            输入完整的 CSS font-family 值，按回车或失去焦点后应用
          </p>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-sm font-medium">预览</p>
        <p className="text-base">The quick brown fox jumps over the lazy dog.</p>
        <p className="text-base">快速的棕色狐狸跳过懒狗。0123456789</p>
      </div>
    </div>
  )
}

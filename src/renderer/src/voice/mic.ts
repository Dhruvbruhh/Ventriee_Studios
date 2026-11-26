/** Raw mic frames (~21 ms each) with the browser's echo cancellation and noise suppression on. */
export class Mic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: ScriptProcessorNode | null = null
  sampleRate = 48000

  async start(onFrame: (frame: Float32Array) => void) {
    this.stop()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    })
    this.ctx = new AudioContext()
    this.sampleRate = this.ctx.sampleRate
    const source = this.ctx.createMediaStreamSource(this.stream)
    // shortcut: ScriptProcessor is deprecated but needs no separate worklet file; move to an AudioWorklet if Chromium drops it.
    this.node = this.ctx.createScriptProcessor(1024, 1, 1)
    this.node.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)))
    source.connect(this.node)
    // A processor only runs while connected; its output buffer stays silent.
    this.node.connect(this.ctx.destination)
  }

  stop() {
    if (this.node) this.node.onaudioprocess = null
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
    this.node = null
    this.stream = null
    this.ctx = null
  }
}

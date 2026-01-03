export function downloadAgentScript() {
  const link = document.createElement("a");
  link.href = "/NovaAgent.bat";
  link.download = "NovaAgent.bat";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

Set WshShell = CreateObject("WScript.Shell")
strCurDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurDir
WshShell.Run """" & strCurDir & "\node_modules\electron\dist\electron.exe"" """ & strCurDir & """", 0, False

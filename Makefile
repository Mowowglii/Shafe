TC = tsc
TFLAGS = --project
CONFIGFILE = tsconfig.json
DEST = src\main\resources\static\js

# On Windows cmd, we don't use 'find'. We let tsc handle file tracking.
js:
	@echo Compiling TypeScript...
	@$(TC) $(TFLAGS) $(CONFIGFILE)

watch:
	@echo Watching TypeScript files for changes...
	@$(TC) $(TFLAGS) $(CONFIGFILE) --watch

# Windows-specific clean command
clean:
	@echo Cleaning compiled JS files...
	@if exist $(DEST) rmdir /s /q $(DEST)
	@mkdir $(DEST)

.PHONY: js watch clean
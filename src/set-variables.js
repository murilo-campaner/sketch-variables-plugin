import sketch from "sketch";

const Dom = require("sketch/dom");
const Document = require('sketch/dom').Document
const Settings = require("sketch/settings");

export default function () {
  const pregQuote = (str, delimiter) => {
    return (str + "").replace(
      new RegExp(
        "[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\" + (delimiter || "") + "-]",
        "g"
      ),
      "\\$&"
    );
  };

  const replaceTextVars = (text, key, value) => {
    var regex = new RegExp(pregQuote(key), "g");
    const newText = text.replace(regex, value);
    return newText;
  };

  const getSymbolsWithLayerType = (layerType) => {
    const document = Dom.getSelectedDocument();
    const symbols = document.getSymbols();
    const symbolsWithLayer = symbols.filter((symbol) => {
      const hasText = Dom.find(layerType, symbol).length > 0;
      return hasText;
    });
    return symbolsWithLayer;
  };

  const saveFileAs = () => {
    return new Promise((resolve, reject) => {
      const document = Dom.getSelectedDocument();
      const pathParts = document.path.split('/');
      const filename = pathParts.pop();
      const folderPath = pathParts.join('/')
      const match = filename.match(/.*?v(\d+).sketch$/)
      
      let newFilename;
      if (match) {
        const actualVersion = match ? Number.parseInt(match[1]) : 0;
        newFilename = filename.replace(`v${actualVersion}`, `v${(actualVersion+1)}`);
      } else {
        newFilename = filename.replace('.sketch', '-v1.sketch');
      }

      document.save(`${folderPath}/${newFilename}`, { saveMode: Document.SaveMode.SaveAs });

    });
  };

  const createWindow = async (variables, successCallback = () => {}, errorCallback = () => {}) => {
    const dialogWindow = COSAlertWindow.new();

    if (Object.keys(variables).length === 0) {
      dialogWindow.setMessageText("No variables found"); // index 0
      dialogWindow.setInformativeText(
        "Add a variable to TEXT element using the following template @[VARNAME]"
      ); // index 1
      dialogWindow.runModal();
      return;
    }

    dialogWindow.setMessageText("Set variables values"); // index 0
    dialogWindow.setInformativeText(
      "Set the values for each variable at your document..."
    ); // index 1

    const fieldsIndexes = {};
    let initialIndex = 1;
    Object.keys(variables).forEach((key, index) => {
      dialogWindow.addTextLabelWithValue(key); // key 2 // key 4 // key 6 // key 8
      dialogWindow.addTextFieldWithValue(variables[key].value || ""); // key 3 // key 5 // key 7 // key 9
      fieldsIndexes[initialIndex] = key;
      initialIndex += 2;
    });

    var view = NSView.alloc().initWithFrame(NSMakeRect(0, 0, 425, 20));
    dialogWindow.addAccessoryView(view);

    const checkbox = NSButton.alloc().initWithFrame(NSMakeRect(0, 0, 425, 20));
    checkbox.setButtonType(NSSwitchButton);
    checkbox.setState(NSOffState);
    checkbox.setBezelStyle(0);
    checkbox.setTitle("Save as new file, this is a template");
    view.addSubview(checkbox);

    dialogWindow.addButtonWithTitle("Update variables");
    dialogWindow.addButtonWithTitle("Cancel");

    const response = dialogWindow.runModal();
    if (response === 1000) {
      const saveAsNewFile = checkbox.stringValue() == "1";
      const newValues = {};
      Object.keys(fieldsIndexes).forEach((index) => {
        if (
          dialogWindow.viewAtIndex(index) &&
          dialogWindow.viewAtIndex(index).stringValue().length() > 0
        ) {
          newValues[fieldsIndexes[index]] = dialogWindow
            .viewAtIndex(index)
            .stringValue();
        } else {
          newValues[fieldsIndexes[index]] = "";
        }
      });

      if (saveAsNewFile) {
        try {
          await saveFileAs();
          successCallback(newValues);
        } catch(e) {
          errorCallback(e);
        }
      }
      else {
        successCallback(newValues);
      }
    }
  };

  const getTextVariables = (text) => {
    const match = text.match(/@\[(.*?)\]/gm);
    return match || [];
  };

  /**
   * Find all document text variables
   */
  const findVariables = () => {
    sketch.UI.message("Scanning variables...");
    const document = Dom.getSelectedDocument();
    const cachedVariables =
    Settings.documentSettingForKey(document, "replaced-variables") || {};
    const variables = Object.keys(cachedVariables).reduce((prev, key) => {
      if (cachedVariables[key].value) {
        return { ...prev, [key]: { ...cachedVariables[key] } };
      }
      return prev;
    }, {});
    const symbolsWithText = getSymbolsWithLayerType("Text");

    symbolsWithText.forEach((symbol) => {
      const instances = symbol.getAllInstances();
      instances.forEach((instance) => {
        instance.overrides.forEach((override) => {
          if (override.property === "stringValue") {
            const textVariables = getTextVariables(override.value);
            if (textVariables.length > 0) {
              textVariables.forEach((varKey) => {
                if (!variables[varKey]) {
                  variables[varKey] = { value: "", elements: [] };
                }
                if (
                  !variables[varKey].elements.find(
                    (el) => el?.overrideId === override.id
                  )
                ) {
                  variables[varKey].elements.push({
                    instanceId: instance.id,
                    overrideId: override.id,
                  });
                }
              });
            }
          }
        });
      });
    });

    const textLayers = Dom.find("Text");
    textLayers.forEach((textLayer) => {
      const textVariables = getTextVariables(textLayer.text);
      if (textVariables.length > 0) {
        textVariables.forEach((varKey) => {
          if (!variables[varKey]) {
            variables[varKey] = { value: "", elements: [] };
          }
          if (
            !variables[varKey].elements.find(
              (el) => el.instanceId === textLayer.id
            )
          ) {
            variables[varKey].elements.push({
              instanceId: textLayer.id,
            });
          }
        });
      }
    });

    Settings.setDocumentSettingForKey(
      document,
      "replaced-variables",
      variables
    );
    return variables;
  };

  const handleUpdate = (replaceVars) => {
    const document = Dom.getSelectedDocument();
    const variables =
      Settings.documentSettingForKey(document, "replaced-variables") || {};
    
      Object.keys(replaceVars).forEach((key) => {
    
      if (replaceVars[key] === '') {
        delete variables[key];
      }

      if (variables[key]) {

        variables[key].elements.forEach((element) => {
          const layer = document.getLayerWithID(element.instanceId);
          if (!layer) {
            return;
          }

          if (element.overrideId) {
            const override = layer.overrides.find(
              (el) => el.id === element.overrideId
            );
            override.value = replaceTextVars(
              override.value,
              key,
              replaceVars[key]
            );
          } else {
            layer.text = replaceTextVars(layer.text, key, replaceVars[key]);
          }
        });
        variables[key].value = replaceVars[key];
      }
    });
  
    Settings.setDocumentSettingForKey(
      document,
      "replaced-variables",
      variables
    );
  };

  const main = async () => {
    const documentVariables = findVariables();
    await createWindow(
      documentVariables, 
      handleUpdate, 
      (error) => {
        console.log(error);
      });
  };

  main();
}
